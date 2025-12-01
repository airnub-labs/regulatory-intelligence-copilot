import * as React from "react"
import { Loader2, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface PromptInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  placeholder?: string
  disabled?: boolean
  isLoading?: boolean
  className?: string
}

export function PromptInput({
  value,
  onChange,
  onSubmit,
  placeholder = "Ask about tax, welfare, pensions, or cross-border rules. The copilot will query the regulatory graph and timeline engine for you.",
  disabled = false,
  isLoading = false,
  className,
}: PromptInputProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (value.trim() && !disabled && !isLoading) {
      onSubmit()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">Shift + Enter for newline</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">Enter to send</span>
      </div>
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-b from-background/90 via-card/90 to-background/90 shadow-inner">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isLoading}
          rows={3}
          className="w-full resize-none border-0 bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
        />
        <div className="flex items-center justify-between gap-3 border-t bg-card/70 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full bg-muted px-2 py-1" title="Responses streamed from the Compliance Engine via SSE.">Streaming SSE</span>
            <span className="rounded-full bg-muted px-2 py-1" title="Answers are generated via the Compliance Engine, which queries the regulatory graph and timeline engine.">Graph-grounded</span>
            <span className="rounded-full bg-muted px-2 py-1" title="Outbound LLM calls are sanitised and policy-checked by the egress guard.">Egress-guarded</span>
          </div>
          <Button
            type="submit"
            disabled={disabled || isLoading || !value.trim()}
            size="lg"
            className="h-11 gap-2 px-5"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending
              </>
            ) : (
              <>
                Send
                <Send className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </form>
  )
}
