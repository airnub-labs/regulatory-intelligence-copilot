import * as React from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

interface ChatContainerProps {
  children: React.ReactNode
  className?: string
}

export function ChatContainer({ children, className }: ChatContainerProps) {
  return (
    <ScrollArea className={cn("flex-1 w-full", className)}>
      <div className="flex flex-col gap-4 p-4">
        {children}
      </div>
    </ScrollArea>
  )
}

interface ChatWelcomeProps {
  children: React.ReactNode
  className?: string
}

export function ChatWelcome({ children, className }: ChatWelcomeProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center h-full text-center space-y-4 p-8", className)}>
      {children}
    </div>
  )
}
