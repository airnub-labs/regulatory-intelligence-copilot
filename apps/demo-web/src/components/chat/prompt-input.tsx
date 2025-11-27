import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  placeholder = "Type a message...",
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={cn("flex gap-2", className)}>
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled || isLoading}
        className="flex-1 h-11"
      />
      <Button
        type="submit"
        disabled={disabled || isLoading || !value.trim()}
        size="lg"
        className="h-11"
      >
        {isLoading ? "Sending..." : "Send"}
      </Button>
    </form>
  )
}
