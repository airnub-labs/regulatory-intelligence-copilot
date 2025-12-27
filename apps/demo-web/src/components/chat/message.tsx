import * as React from "react"
import { Bot, GitBranch, Pencil, Pin, PinOff, ShieldCheck, User } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { MessageVersionNav } from "./message-version-nav"

type ListBuffer = {
  type: "ul" | "ol"
  items: React.ReactNode[]
}

function renderInlineMarkdown(text: string, keyPrefix: string) {
  const elements: React.ReactNode[] = []
  const regex = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      elements.push(text.slice(lastIndex, match.index))
    }

    if (match[1] && match[2]) {
      elements.push(
        <a key={`${keyPrefix}-link-${elements.length}`} href={match[2]} target="_blank" rel="noreferrer">
          {match[1]}
        </a>
      )
    } else if (match[3]) {
      elements.push(<strong key={`${keyPrefix}-strong-${elements.length}`}>{match[3]}</strong>)
    } else if (match[4]) {
      elements.push(<em key={`${keyPrefix}-em-${elements.length}`}>{match[4]}</em>)
    } else if (match[5]) {
      elements.push(<code key={`${keyPrefix}-code-${elements.length}`}>{match[5]}</code>)
    }

    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) {
    elements.push(text.slice(lastIndex))
  }

  return elements
}

function renderMarkdown(content: string) {
  const elements: React.ReactNode[] = []
  let paragraphBuffer: string[] = []
  let listBuffer: ListBuffer | null = null

    const flushParagraph = () => {
      if (paragraphBuffer.length === 0) return
      elements.push(
        <p key={`paragraph-${elements.length}`}>
          {renderInlineMarkdown(paragraphBuffer.join(" "), `paragraph-${elements.length}`)}
      </p>
    )
    paragraphBuffer = []
  }

  const flushList = () => {
    if (!listBuffer) return
    const ListTag = listBuffer.type === "ul" ? "ul" : "ol"
    elements.push(
      <ListTag key={`list-${elements.length}`}>
        {listBuffer.items.map((item, index) => (
          <li key={`list-item-${elements.length}-${index}`}>{item}</li>
        ))}
      </ListTag>
    )
    listBuffer = null
  }

  content.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim()
    const bulletMatch = trimmed.match(/^[-*+]\s+(.*)$/)
    const orderedMatch = trimmed.match(/^\d+[.)]\s+(.*)$/)
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.*)$/)

      if (headingMatch) {
        flushParagraph()
        flushList()
        const level = headingMatch[1].length
        const Tag = (level === 1 ? "h1" : level === 2 ? "h2" : "h3") as keyof React.JSX.IntrinsicElements
        elements.push(
          <Tag key={`heading-${elements.length}`}>
            {renderInlineMarkdown(headingMatch[2], `heading-${elements.length}`)}
        </Tag>
      )
      return
    }

    if (bulletMatch) {
      flushParagraph()
      const item = bulletMatch[1]
      if (!listBuffer || listBuffer.type !== "ul") {
        flushList()
        listBuffer = { type: "ul", items: [] }
      }
      listBuffer.items.push(
        <span key={`list-item-content-${listBuffer.items.length}`}>
          {renderInlineMarkdown(item, `list-${elements.length}-${listBuffer?.items.length ?? 0}`)}
        </span>
      )
      return
    }

    if (orderedMatch) {
      flushParagraph()
      const item = orderedMatch[1]
      if (!listBuffer || listBuffer.type !== "ol") {
        flushList()
        listBuffer = { type: "ol", items: [] }
      }
      listBuffer.items.push(
        <span key={`ordered-item-content-${listBuffer.items.length}`}>
          {renderInlineMarkdown(item, `list-${elements.length}-${listBuffer?.items.length ?? 0}`)}
        </span>
      )
      return
    }

    if (trimmed === "") {
      flushParagraph()
      flushList()
      return
    }

    flushList()
    paragraphBuffer.push(trimmed)
  })

  flushParagraph()
  flushList()

  return elements
}

interface MessageMetadata {
  agentId?: string
  jurisdictions?: string[]
  uncertaintyLevel?: "low" | "medium" | "high"
  referencedNodes?: string[]
  // Branch preview fields (for version navigation)
  isBranchPreview?: boolean
  branchPathId?: string
  branchIndex?: number
}

interface MessageProps {
  role: "user" | "assistant"
  content: string
  className?: string
  metadata?: MessageMetadata
  disclaimer?: string
  // Action props
  messageId?: string
  onEdit?: (messageId: string) => void
  onBranch?: (messageId: string) => void
  showActions?: boolean
  // Branch indicator props
  isBranchPoint?: boolean
  branchedPaths?: string[]
  onViewBranch?: (pathId: string) => void
  // Pinning props
  isPinned?: boolean
  onTogglePin?: (messageId: string, isPinned: boolean) => void
  // Version navigation props (for messages with multiple versions/branches)
  versionCount?: number
  currentVersionIndex?: number
  versionTimestamp?: Date
  onVersionPrevious?: () => void
  onVersionNext?: () => void
}

export function Message({
  role,
  content,
  className,
  metadata,
  disclaimer,
  messageId,
  onEdit,
  onBranch,
  showActions = true,
  isBranchPoint = false,
  branchedPaths = [],
  onViewBranch,
  isPinned = false,
  onTogglePin,
  versionCount = 1,
  currentVersionIndex = 0,
  versionTimestamp,
  onVersionPrevious,
  onVersionNext,
}: MessageProps) {
  const isUser = role === "user"
  const canShowActions = showActions && messageId
  const hasBranches = isBranchPoint && branchedPaths.length > 0
  const hasVersions = versionCount > 1 && onVersionPrevious && onVersionNext
  const isBranchPreview = metadata?.isBranchPreview ?? false
  const branchPathId = metadata?.branchPathId
  const branchIndex = metadata?.branchIndex ?? 1

  const nodesCount = metadata?.referencedNodes?.length ?? 0

  // Render branch preview card when viewing a branch version
  if (isBranchPreview && branchPathId && onViewBranch) {
    return (
      <div
        id={messageId ? `message-${messageId}` : undefined}
        data-message-id={messageId}
        data-is-branch-preview={true}
        data-branch-path-id={branchPathId}
        className={cn("group flex w-full gap-3", isUser ? "justify-end" : "justify-start", className)}
      >
        {!isUser && (
          <Avatar className="h-9 w-9 shrink-0 shadow-sm">
            <AvatarFallback className="bg-primary/60 text-primary-foreground text-xs">
              <GitBranch className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
        )}
        <div className={cn("flex max-w-[88%] flex-col gap-2", isUser && "items-end")}>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            <GitBranch className="h-3.5 w-3.5" />
            Branch Preview
            <span className="h-1 w-1 rounded-full bg-muted-foreground" />
            Alternative path
          </div>
          <div className="flex flex-col gap-2">
            <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 px-4 py-4 shadow-sm">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <GitBranch className="h-5 w-5 text-primary" />
                  Branch {branchIndex}
                </div>
                <p className="text-xs text-muted-foreground max-w-[200px]">
                  This message has an alternative version on a different branch.
                </p>
                <Button
                  size="sm"
                  variant="default"
                  className="mt-1"
                  onClick={() => onViewBranch(branchPathId)}
                >
                  <GitBranch className="mr-2 h-4 w-4" />
                  View Branch
                </Button>
              </div>
              {hasVersions && (
                <MessageVersionNav
                  currentIndex={currentVersionIndex}
                  totalVersions={versionCount}
                  currentTimestamp={versionTimestamp ?? new Date()}
                  onPrevious={onVersionPrevious!}
                  onNext={onVersionNext!}
                  isOriginal={currentVersionIndex === 0}
                />
              )}
            </div>
          </div>
        </div>
        {isUser && (
          <Avatar className="h-9 w-9 shrink-0 shadow-sm">
            <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">U</AvatarFallback>
          </Avatar>
        )}
      </div>
    )
  }

  return (
    <div
      id={messageId ? `message-${messageId}` : undefined}
      data-message-id={messageId}
      data-is-branch-point={isBranchPoint}
      data-branched-paths={hasBranches ? branchedPaths.join(',') : undefined}
      className={cn(
        "group flex w-full gap-3",
        isUser ? "justify-end" : "justify-start",
        className
      )}
    >
      {!isUser && (
        <Avatar className="h-9 w-9 shrink-0 shadow-sm">
          <AvatarFallback className="bg-primary text-primary-foreground text-xs">AI</AvatarFallback>
        </Avatar>
      )}
      <div className={cn("flex max-w-[88%] flex-col gap-2", isUser && "items-end")}> 
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {isUser ? (
            <>
              <User className="h-3.5 w-3.5" />
              You
              <span className="h-1 w-1 rounded-full bg-muted-foreground" />
              Trusted input
              {hasBranches && (
                <>
                  <span className="h-1 w-1 rounded-full bg-muted-foreground" />
                  <button
                    onClick={() => onViewBranch?.(branchedPaths[0])}
                    className="flex items-center gap-1 transition-colors hover:text-foreground"
                    title={`This message has ${branchedPaths.length} branch${branchedPaths.length > 1 ? 'es' : ''}`}
                  >
                    <GitBranch className="h-3.5 w-3.5" />
                    {branchedPaths.length > 1 && (
                      <Badge variant="secondary" className="h-4 px-1.5 text-[9px] font-bold">
                        {branchedPaths.length}
                      </Badge>
                    )}
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <Bot className="h-3.5 w-3.5" />
              Copilot
              <span className="h-1 w-1 rounded-full bg-muted-foreground" />
              Graph grounded
            </>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <div
            className={cn(
              "relative overflow-hidden rounded-2xl border px-4 py-3 shadow-sm transition",
              isUser
                ? "bg-gradient-to-br from-primary to-primary/85 text-primary-foreground"
                : "bg-card/90 text-foreground",
              !isUser && "backdrop-blur supports-[backdrop-filter]:border-border/80",
              isPinned && "ring-2 ring-amber-400/50 border-amber-300 dark:ring-amber-500/30 dark:border-amber-700"
            )}
          >
            {isPinned && (
              <div className="absolute left-3 top-3 flex items-center gap-1">
                <Badge className="flex items-center gap-1 bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100" variant="secondary">
                  <Pin className="h-3 w-3" />
                  Pinned
                </Badge>
              </div>
            )}
            {!isUser && (
              <Badge className="absolute right-3 top-3 flex items-center gap-1" variant="secondary">
                <ShieldCheck className="h-3.5 w-3.5" />
                AI Elements
              </Badge>
            )}
            <div className="space-y-2">
              <MessageContent
                content={content}
                tone={isUser ? "user" : "assistant"}
              />
              {canShowActions && (
                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  {isUser && onEdit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => onEdit(messageId!)}
                      title="Edit message"
                    >
                      <Pencil className="mr-1 h-3 w-3" />
                      Edit
                    </Button>
                  )}
                  {isUser && onBranch && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => onBranch(messageId!)}
                      title="Branch from here"
                    >
                      <GitBranch className="mr-1 h-3 w-3" />
                      Branch
                    </Button>
                  )}
                  {onTogglePin && (
                    <Button
                      size="sm"
                      variant={isPinned ? "secondary" : "ghost"}
                      className={cn(
                        "h-7 px-2 text-xs",
                        isPinned && "bg-amber-100 text-amber-900 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-100 dark:hover:bg-amber-900/50"
                      )}
                      onClick={() => onTogglePin(messageId!, isPinned)}
                      title={isPinned ? "Unpin message" : "Pin message"}
                    >
                      {isPinned ? (
                        <>
                          <PinOff className="mr-1 h-3 w-3" />
                          Unpin
                        </>
                      ) : (
                        <>
                          <Pin className="mr-1 h-3 w-3" />
                          Pin
                        </>
                      )}
                    </Button>
                  )}
                </div>
              )}
              {hasBranches && onViewBranch && (
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <GitBranch className="h-3 w-3" />
                  <span>This message has {branchedPaths.length} branch{branchedPaths.length > 1 ? 'es' : ''}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-xs"
                    onClick={() => onViewBranch(branchedPaths[0])}
                    title="View branch"
                  >
                    View
                    {branchedPaths.length > 1 && (
                      <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                        +{branchedPaths.length - 1}
                      </Badge>
                    )}
                  </Button>
                </div>
              )}
              {!isUser && disclaimer && (
                <div className="rounded-xl border border-amber-200/60 bg-amber-50/60 p-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
                  {disclaimer}
                </div>
              )}
              {hasVersions && (
                <MessageVersionNav
                  currentIndex={currentVersionIndex}
                  totalVersions={versionCount}
                  currentTimestamp={versionTimestamp ?? new Date()}
                  onPrevious={onVersionPrevious}
                  onNext={onVersionNext}
                  isOriginal={currentVersionIndex === 0}
                />
              )}
            </div>
          </div>
          {!isUser && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground">
              <span className="rounded-full bg-background px-2 py-1 text-xs font-semibold text-foreground">
                Agent: {metadata?.agentId ?? "pending"}
              </span>
              <span className="rounded-full bg-background px-2 py-1 text-xs">
                Jurisdictions: {metadata?.jurisdictions?.join(", ") ?? "pending"}
              </span>
              <span className="rounded-full bg-background px-2 py-1 text-xs">
                Uncertainty: {metadata?.uncertaintyLevel ?? "unknown"}
              </span>
              <span className="rounded-full bg-background px-2 py-1 text-xs">Nodes: {nodesCount}</span>
            </div>
          )}
        </div>
      </div>
      {isUser && (
        <Avatar className="h-9 w-9 shrink-0 shadow-sm">
          <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">U</AvatarFallback>
        </Avatar>
      )}
    </div>
  )
}

interface MessageContentProps {
  content: string
  tone: "user" | "assistant"
  className?: string
}

export function MessageContent({ content, tone, className }: MessageContentProps) {
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none dark:prose-invert",
        tone === "assistant" ? "text-foreground" : "text-primary-foreground",
        className
      )}
    >
      <div className="text-sm leading-relaxed">{renderMarkdown(content)}</div>
    </div>
  )
}

export function MessageLoading() {
  return (
    <div className="flex w-full justify-start gap-3">
      <Avatar className="h-9 w-9 shrink-0 shadow-sm">
        <AvatarFallback className="bg-primary text-primary-foreground text-xs">AI</AvatarFallback>
      </Avatar>
      <div className="flex max-w-[88%] flex-col gap-2">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          <Bot className="h-3.5 w-3.5" /> Copilot <span className="h-1 w-1 rounded-full bg-muted-foreground" /> Streaming
        </div>
        <div className="relative overflow-hidden rounded-2xl border bg-card/90 px-4 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:border-border/80">
          <div className="flex gap-2">
            <div className="h-2.5 w-2.5 animate-bounce rounded-full bg-muted-foreground" />
            <div className="h-2.5 w-2.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:120ms]" />
            <div className="h-2.5 w-2.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:240ms]" />
          </div>
        </div>
      </div>
    </div>
  )
}
