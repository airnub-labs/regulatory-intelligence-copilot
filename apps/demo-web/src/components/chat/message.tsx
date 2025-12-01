import * as React from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
        "flex gap-3 w-full",
        isUser ? "justify-end" : "justify-start",
        className
      )}
    >
      {!isUser && (
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="bg-primary text-primary-foreground text-xs">
            AI
          </AvatarFallback>
        </Avatar>
      )}
        <div
          className={cn(
            "flex flex-col gap-1 max-w-[85%]",
            isUser && "items-end"
          )}
        >
          <div
            className={cn(
              "rounded-lg px-4 py-3",
              isUser
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground border border-border"
            )}
          >
            <MessageContent content={content} tone={isUser ? "user" : "assistant"} />
          </div>
        </div>
      {isUser && (
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">
            U
          </AvatarFallback>
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
        "prose prose-sm dark:prose-invert max-w-none",
        tone === "assistant" ? "text-foreground" : "text-primary-foreground"
      )}
    >
      <div className="text-sm leading-relaxed">{renderMarkdown(content)}</div>
    </div>
  )
}

export function MessageLoading() {
  return (
    <div className="flex gap-3 w-full justify-start">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className="bg-primary text-primary-foreground text-xs">
          AI
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-col gap-1 max-w-[85%]">
        <div className="rounded-lg px-4 py-3 bg-muted border border-border">
          <div className="flex gap-1">
            <div className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" />
            <div className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce [animation-delay:0.1s]" />
            <div className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce [animation-delay:0.2s]" />
          </div>
        </div>
      </div>
    </div>
  )
}
