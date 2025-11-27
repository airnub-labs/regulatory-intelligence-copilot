import * as React from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

interface MessageProps {
  role: "user" | "assistant"
  content: React.ReactNode
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
          <MessageContent>{content}</MessageContent>
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
  children: React.ReactNode
}

export function MessageContent({ children }: MessageContentProps) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <div className="whitespace-pre-wrap text-sm leading-relaxed">
        {children}
      </div>
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
