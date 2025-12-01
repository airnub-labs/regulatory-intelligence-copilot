import * as React from "react"
import { Bot, ShieldCheck, User } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

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
      const Tag = (level === 1 ? "h1" : level === 2 ? "h2" : "h3") as keyof JSX.IntrinsicElements
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

interface MessageProps {
  role: "user" | "assistant"
  content: string
  className?: string
}

export function Message({ role, content, className }: MessageProps) {
  const isUser = role === "user"

  return (
    <div
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
        <div
          className={cn(
            "relative overflow-hidden rounded-2xl border px-4 py-3 shadow-sm transition", 
            isUser
              ? "bg-gradient-to-br from-primary to-primary/85 text-primary-foreground"
              : "bg-card/90 text-foreground",
            !isUser && "backdrop-blur supports-[backdrop-filter]:border-border/80"
          )}
        >
          {!isUser && (
            <Badge className="absolute right-3 top-3 flex items-center gap-1" variant="secondary">
              <ShieldCheck className="h-3.5 w-3.5" />
              AI Elements
            </Badge>
          )}
          <MessageContent content={content} tone={isUser ? "user" : "assistant"} />
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
}

export function MessageContent({ content, tone }: MessageContentProps) {
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none dark:prose-invert",
        tone === "assistant" ? "text-foreground" : "text-primary-foreground"
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
