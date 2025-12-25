import * as React from "react"
import { Code, LineChart, Loader2, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useClientTelemetry } from "@/lib/clientTelemetry"
import { cn } from "@/lib/utils"

export interface ForceTool {
  name: string
  args: Record<string, unknown>
}

interface PromptInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (forceTool?: ForceTool) => void
  placeholder?: string
  disabled?: boolean
  isLoading?: boolean
  className?: string
  /** Enable code execution buttons (Run Code / Run Analysis) */
  showExecutionButtons?: boolean
  telemetryContext?: {
    conversationId?: string
  }
}

export function PromptInput({
  value,
  onChange,
  onSubmit,
  placeholder = "Ask about tax, welfare, pensions, or cross-border rules. The copilot will query the regulatory graph and timeline engine for you.",
  disabled = false,
  isLoading = false,
  className,
  showExecutionButtons = false,
  telemetryContext,
}: PromptInputProps) {
  const telemetry = useClientTelemetry("ChatPromptInput", {
    defaultContext: telemetryContext,
  })

  const logSubmission = React.useCallback(
    (action: "prompt" | "run_code" | "run_analysis", trimmed: string) => {
      const logger = telemetry.withRequest(
        telemetry.newRequestId(`prompt-${action}`),
        {
          ...telemetryContext,
          action,
        }
      )
      logger.info(
        { messageLength: trimmed.length },
        `Submitting ${action.replace("_", " ")} request`
      )
    },
    [telemetry, telemetryContext]
  )

  const handleSubmit = (e: React.FormEvent, forceTool?: ForceTool) => {
    e.preventDefault()
    if (value.trim() && !disabled && !isLoading) {
      logSubmission("prompt", value.trim())
      onSubmit(forceTool)
    }
  }

  const handleRunCode = (e: React.MouseEvent) => {
    e.preventDefault()
    if (!disabled && !isLoading && value.trim()) {
      logSubmission("run_code", value.trim())
      onSubmit({ name: 'run_code', args: { code: value.trim() } })
    }
  }

  const handleRunAnalysis = (e: React.MouseEvent) => {
    e.preventDefault()
    if (!disabled && !isLoading && value.trim()) {
      logSubmission("run_analysis", value.trim())
      onSubmit({ name: 'run_analysis', args: { query: value.trim() } })
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
          <div className="flex items-center gap-2">
            {showExecutionButtons && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={disabled || isLoading || !value.trim()}
                  size="sm"
                  className="h-9 gap-1.5 px-3"
                  onClick={handleRunCode}
                  title="Execute the input as Python code in an E2B sandbox"
                >
                  <Code className="h-4 w-4" />
                  Run Code
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={disabled || isLoading || !value.trim()}
                  size="sm"
                  className="h-9 gap-1.5 px-3"
                  onClick={handleRunAnalysis}
                  title="Run data analysis with the input query"
                >
                  <LineChart className="h-4 w-4" />
                  Run Analysis
                </Button>
              </>
            )}
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
      </div>
    </form>
  )
}
