import * as React from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

type ListBuffer = {
  type: "ul" | "ol"
  items: string[]
}

function renderMarkdown(content: string) {
  const elements: React.ReactNode[] = []
  let paragraphBuffer: string[] = []
  let listBuffer: ListBuffer | null = null

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return
    elements.push(
      <p key={`paragraph-${elements.length}`}>{paragraphBuffer.join(" ")}</p>
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

    if (bulletMatch) {
      flushParagraph()
      const item = bulletMatch[1]
      if (!listBuffer || listBuffer.type !== "ul") {
        flushList()
        listBuffer = { type: "ul", items: [] }
      }
      listBuffer.items.push(item)
      return
    }

    if (orderedMatch) {
      flushParagraph()
      const item = orderedMatch[1]
      if (!listBuffer || listBuffer.type !== "ol") {
        flushList()
        listBuffer = { type: "ol", items: [] }
      }
      listBuffer.items.push(item)
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
            <MessageContent content={content} />
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
}

export function MessageContent({ content }: MessageContentProps) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
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
