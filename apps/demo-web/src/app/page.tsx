'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, BookOpenCheck, Globe2, ShieldHalf, Sparkles, Wand2 } from 'lucide-react'

import { ChatContainer, ChatWelcome } from '@/components/chat/chat-container'
import { Message, MessageLoading } from '@/components/chat/message'
import { PromptInput } from '@/components/chat/prompt-input'
import { AppHeader } from '@/components/layout/app-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/**
 * User profile for regulatory context
 */
interface UserProfile {
  personaType:
    | 'single-director-ie'
    | 'self-employed-contractor-ie'
    | 'paye-eu-ties'
    | 'cross-border-ie-eu'
  jurisdictions: string[]
}

interface ChatMetadata {
  agentId: string
  jurisdictions: string[]
  uncertaintyLevel: 'low' | 'medium' | 'high'
  disclaimerKey: string
  referencedNodes: string[]
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  disclaimer?: string
  metadata?: ChatMetadata
}

type ShareAudience = 'private' | 'tenant' | 'public'
type TenantAccess = 'view' | 'edit'
type AuthorizationModel = 'supabase_rbac' | 'openfga'

interface ConversationSummary {
  id: string
  title?: string | null
  createdAt: string
  lastMessageAt?: string | null
  shareAudience: ShareAudience
  tenantAccess: TenantAccess
  authorizationModel?: AuthorizationModel
}

function parseSseEvent(eventBlock: string): { type: string; data: string } | null {
  const lines = eventBlock.split('\n')
  let eventType = 'message'
  const dataLines: string[] = []

  for (const line of lines) {
    if (line.startsWith('event:')) {
      eventType = line.replace('event:', '').trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.replace('data:', '').trim())
    }
  }

  if (!eventType && dataLines.length === 0) return null

  return {
    type: eventType,
    data: dataLines.join('\n'),
  }
}

type ParsedSseData = string | Record<string, unknown>

function parseJsonSafe(value: string): ParsedSseData {
  try {
    return JSON.parse(value)
  } catch (error) {
    console.warn('Failed to parse SSE data', error)
    return value
  }
}

interface ApiMessage {
  id?: string
  role: ChatMessage['role']
  content: string
  metadata?: ChatMetadata
}

interface ConversationPayload {
  messages?: ApiMessage[]
  conversation?: {
    shareAudience?: ShareAudience
    tenantAccess?: TenantAccess
    authorizationModel?: AuthorizationModel
    personaId?: UserProfile['personaType']
    jurisdictions?: string[]
  }
}

interface ChatSseMetadata extends ChatMetadata {
  conversationId?: string
  shareAudience?: ShareAudience
  tenantAccess?: TenantAccess
  authorizationModel?: AuthorizationModel
}

const isChatMetadata = (value: unknown): value is ChatMetadata => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.agentId === 'string' &&
    Array.isArray(candidate.jurisdictions) &&
    typeof candidate.uncertaintyLevel === 'string' &&
    typeof candidate.disclaimerKey === 'string' &&
    Array.isArray(candidate.referencedNodes)
  )
}

const isChatSseMetadata = (value: unknown): value is ChatSseMetadata => {
  if (!isChatMetadata(value)) return false
  const candidate = value as Partial<ChatSseMetadata>
  const isValidShareAudience =
    candidate.shareAudience === 'private' || candidate.shareAudience === 'tenant' || candidate.shareAudience === 'public'
  const isValidTenantAccess = candidate.tenantAccess === 'view' || candidate.tenantAccess === 'edit'
  const isValidAuthorizationModel =
    candidate.authorizationModel === 'supabase_rbac' || candidate.authorizationModel === 'openfga'

  return (
    (candidate.conversationId === undefined || typeof candidate.conversationId === 'string') &&
    (candidate.shareAudience === undefined || isValidShareAudience) &&
    (candidate.tenantAccess === undefined || isValidTenantAccess) &&
    (candidate.authorizationModel === undefined || isValidAuthorizationModel)
  )
}

const extractText = (parsedData: ParsedSseData): string => {
  if (typeof parsedData === 'string') return parsedData
  if ('text' in parsedData && typeof parsedData.text === 'string') return parsedData.text
  return ''
}

const extractErrorMessage = (parsedData: ParsedSseData): string => {
  if (typeof parsedData === 'string') return parsedData
  if ('message' in parsedData && typeof parsedData.message === 'string') return parsedData.message
  return 'Unknown error'
}

const quickPrompts = [
  {
    label: 'Graph + welfare',
    prompt: 'Show me how PRSI contributions and jobseeker’s benefit interact for this persona.',
    scenarioHint: 'graph_welfare_prsi_jobseekers_benefit',
  },
  {
    label: 'Graph + tax + CGT',
    prompt:
      'Summarise PAYE, USC, and PRSI obligations for this persona and highlight any graph nodes with recent changes.',
    scenarioHint: 'graph_tax_cgt_recent_changes',
  },
  {
    label: 'Timeline engine',
    prompt: 'Explain how pension contribution limits for this persona change over the next 5 years, based on the regulatory timeline.',
    scenarioHint: 'timeline_pension_contribution_limits',
  },
  {
    label: 'Cross-border / scenario engine',
    prompt: 'Outline social security coordination rules if this persona starts working remotely from another EU country.',
    scenarioHint: 'cross_border_social_security_coordination',
  },
]

const DEMO_USER_ID = '00000000-0000-0000-0000-00000000000a'

const DEFAULT_PERSONA: UserProfile['personaType'] = 'single-director-ie'

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [chatMetadata, setChatMetadata] = useState<ChatMetadata | null>(null)
  const [scenarioHint, setScenarioHint] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<string | undefined>(undefined)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [shareAudience, setShareAudience] = useState<ShareAudience>('private')
  const [tenantAccess, setTenantAccess] = useState<TenantAccess>('edit')
  const [authorizationModel, setAuthorizationModel] = useState<AuthorizationModel>('supabase_rbac')
  const [profile, setProfile] = useState<UserProfile>({
    personaType: DEFAULT_PERSONA,
    jurisdictions: ['IE'],
  })
  const isShared = shareAudience !== 'private'

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const prevMessageCountRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const conversationIdRef = useRef<string | undefined>(undefined)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const loadConversations = async () => {
    const response = await fetch(`/api/conversations?userId=${DEMO_USER_ID}`)
    if (!response.ok) return
    const payload = await response.json()
    setConversations(payload.conversations ?? [])
  }

    const loadConversation = async (id: string) => {
      const response = await fetch(`/api/conversations/${id}?userId=${DEMO_USER_ID}`)
      if (!response.ok) return
      const payload: ConversationPayload = await response.json()
      const loadedMessages: ChatMessage[] = (payload.messages ?? []).map(msg => ({
        id: msg.id ?? crypto.randomUUID(),
        role: msg.role,
        content: msg.content,
        metadata: msg.metadata,
      }))
      setMessages(loadedMessages)
      setConversationId(id)
      conversationIdRef.current = id
      setShareAudience(payload.conversation?.shareAudience ?? 'private')
      setTenantAccess(payload.conversation?.tenantAccess ?? 'edit')
      setAuthorizationModel(payload.conversation?.authorizationModel ?? 'supabase_rbac')
      const personaId = payload.conversation?.personaId
      if (personaId) {
        setProfile(prev => ({ ...prev, personaType: personaId }))
      }
      const jurisdictions = payload.conversation?.jurisdictions
      if (jurisdictions) {
        setProfile(prev => ({ ...prev, jurisdictions }))
      }
    }

  useEffect(() => {
    loadConversations()
  }, [])

  // Only scroll when a new message is added
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      scrollToBottom()
    }
    prevMessageCountRef.current = messages.length
  }, [messages.length])

    const applyMetadata = (metadata: ChatSseMetadata) => {
      if (metadata.conversationId) {
        setConversationId(metadata.conversationId)
        conversationIdRef.current = metadata.conversationId
      }
      if (metadata.shareAudience) {
        setShareAudience(metadata.shareAudience)
      }
      if (metadata.tenantAccess) {
        setTenantAccess(metadata.tenantAccess)
      }
      if (metadata.authorizationModel) {
        setAuthorizationModel(metadata.authorizationModel)
      }
    }

    useEffect(() => {
      if (!conversationId) return
      const controller = new AbortController()

      const subscribe = async () => {
        const response = await fetch(`/api/conversations/${conversationId}/stream?userId=${DEMO_USER_ID}`, {
          signal: controller.signal,
        })
        if (!response.ok || !response.body) return

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { value, done } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          let boundaryIndex
          while ((boundaryIndex = buffer.indexOf('\n\n')) !== -1) {
            const rawEvent = buffer.slice(0, boundaryIndex).trim()
            buffer = buffer.slice(boundaryIndex + 2)

            if (!rawEvent) continue
            const parsedEvent = parseSseEvent(rawEvent)
            if (!parsedEvent) continue
            const parsedData = parseJsonSafe(parsedEvent.data)

            if (parsedEvent.type === 'metadata' && isChatSseMetadata(parsedData)) {
              applyMetadata(parsedData)
              if (conversationIdRef.current) {
                loadConversation(conversationIdRef.current)
              }
            } else if (parsedEvent.type === 'done' && conversationIdRef.current) {
              loadConversation(conversationIdRef.current)
            }
          }
        }
      }

      subscribe()

      return () => {
        controller.abort()
      }
    }, [conversationId])

  const streamChatResponse = async (response: Response, assistantMessageId: string) => {
    if (!response.body) {
      throw new Error('Response stream missing')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    const appendAssistantText = (delta: string) => {
      setMessages(prev =>
        prev.map(message =>
          message.id === assistantMessageId ? { ...message, content: `${message.content}${delta}` } : message
        )
      )
    }

    while (true) {
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      let boundaryIndex
      while ((boundaryIndex = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, boundaryIndex).trim()
        buffer = buffer.slice(boundaryIndex + 2)

        if (!rawEvent) continue
        const parsedEvent = parseSseEvent(rawEvent)
        if (!parsedEvent) continue

          const parsedData = parseJsonSafe(parsedEvent.data)

          switch (parsedEvent.type) {
            case 'metadata': {
              if (!isChatSseMetadata(parsedData)) break
              applyMetadata(parsedData)
              setChatMetadata(parsedData)
              setMessages(prev =>
                prev.map(message =>
                  message.id === assistantMessageId ? { ...message, metadata: parsedData } : message
                )
              )
              break
            }
            case 'message': {
              const textChunk = extractText(parsedData)
              appendAssistantText(textChunk)
              break
            }
            case 'disclaimer': {
              const disclaimerText = extractText(parsedData)
              setMessages(prev =>
                prev.map(message =>
                  message.id === assistantMessageId ? { ...message, disclaimer: disclaimerText } : message
                )
              )
              break
            }
            case 'error': {
              const errorMessage = extractErrorMessage(parsedData)
              appendAssistantText(`Error: ${errorMessage}`)
              return
            }
            case 'done':
              return
            default:
              break
          }
        }
      }
    }

  const handleSubmit = async () => {
    if (!input.trim()) return

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: input.trim() }
    const assistantMessage: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: '' }

      setMessages(prev => [...prev, userMessage, assistantMessage])
    setInput('')
    setIsLoading(true)
    setChatMetadata(null)

    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: conversationIdRef.current,
          message: input.trim(),
          profile,
          scenarioHint,
          userId: DEMO_USER_ID,
          shareAudience,
          tenantAccess,
          authorizationModel,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`)
      }

      await streamChatResponse(response, assistantMessage.id)
    } catch (error) {
      const fallback = error instanceof Error ? error.message : 'Unknown error'
      setMessages(prev =>
        prev.map(message =>
          message.id === assistantMessage.id ? { ...message, content: `Error: ${fallback}` } : message
        )
      )
    } finally {
      setIsLoading(false)
      setScenarioHint(null)
      loadConversations()
    }
  }

  const toggleJurisdiction = (jur: string) => {
    const current = profile.jurisdictions
    if (current.includes(jur)) {
      setProfile({ ...profile, jurisdictions: current.filter(j => j !== jur) })
    } else {
      setProfile({ ...profile, jurisdictions: [...current, jur] })
    }
  }

  const toggleSharing = async () => {
    if (!conversationIdRef.current) return
    const nextAudience: ShareAudience = shareAudience === 'private' ? 'tenant' : 'private'
    const nextTenantAccess: TenantAccess = nextAudience === 'tenant' ? 'edit' : tenantAccess
    const response = await fetch(`/api/conversations/${conversationIdRef.current}?userId=${DEMO_USER_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shareAudience: nextAudience, tenantAccess: nextTenantAccess }),
    })
    if (response.ok) {
      setShareAudience(nextAudience)
      setTenantAccess(nextTenantAccess)
      loadConversations()
    }
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-background via-muted/40 to-background text-foreground">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_18%,rgba(14,165,233,0.16),transparent_28%),radial-gradient(circle_at_82%_12%,rgba(236,72,153,0.14),transparent_30%),radial-gradient(circle_at_50%_65%,rgba(109,40,217,0.16),transparent_28%)] blur-3xl" />
      <AppHeader primaryAction={{ label: 'View Graph', href: `/graph?conversationId=${conversationIdRef.current}` }} />

      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-12 pt-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.8fr)]">
          <section className="flex min-h-[70vh] flex-col overflow-hidden rounded-3xl border bg-card/95 shadow-2xl backdrop-blur supports-[backdrop-filter]:border-border/80">
            <div className="flex flex-col gap-4 border-b bg-gradient-to-r from-muted/60 via-background to-muted/40 px-6 py-5 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Vercel AI Elements experience
                </div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold tracking-tight">Regulatory Intelligence Copilot</h1>
                  <Badge variant="secondary" className="rounded-full">Live preview</Badge>
                </div>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Persona-aware answers grounded on the regulatory graph, with timeline- and scenario-aware reasoning.
                </p>
                <p className="text-xs text-muted-foreground">
                  Answers are grounded in a Memgraph regulatory graph, a timeline engine for law-in-time, and scenario-aware agents.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge
                  variant="outline"
                  className="flex items-center gap-1 bg-primary/10 text-primary"
                  title="Questions are answered against a live Memgraph regulatory graph."
                >
                  <Wand2 className="h-3.5 w-3.5" /> Graph-backed
                </Badge>
                <Badge
                  variant="outline"
                  className="flex items-center gap-1"
                  title="Modelled support for IE, UK, EU, and selected cross-border cases."
                >
                  <Globe2 className="h-3.5 w-3.5" /> Multi-jurisdiction
                </Badge>
                <Badge
                  variant="outline"
                  className="flex items-center gap-1"
                  title="Not legal / tax advice. See guardrails in the footer."
                >
                  <ShieldHalf className="h-3.5 w-3.5" /> Research-only
                </Badge>
              </div>
            </div>

            <div className="grid gap-4 border-b px-6 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Persona (feeds into agent routing)</label>
                <Select
                  value={profile.personaType}
                  onValueChange={(value) => setProfile({ ...profile, personaType: value as UserProfile['personaType'] })}
                >
                  <SelectTrigger className="w-full md:w-[260px]">
                    <SelectValue placeholder="Choose persona" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single-director-ie">Single-director company (IE)</SelectItem>
                    <SelectItem value="self-employed-contractor-ie">Self-employed / contractor (IE)</SelectItem>
                    <SelectItem value="paye-eu-ties">PAYE employee with EU ties</SelectItem>
                    <SelectItem value="cross-border-ie-eu">Cross-border worker (IE–EU)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Jurisdictions (feeds into graph & timeline filters)</label>
                <div className="flex flex-wrap gap-2">
                  {['IE', 'UK', 'EU', 'MT', 'IM'].map((jur) => (
                    <Badge
                      key={jur}
                      onClick={() => toggleJurisdiction(jur)}
                      variant={profile.jurisdictions.includes(jur) ? 'default' : 'outline'}
                      className="cursor-pointer rounded-full px-3 py-1 text-sm transition hover:translate-y-[-1px] hover:shadow-sm"
                    >
                      {jur}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Persona and jurisdictions are passed into the prompt builder and used to filter the graph, timeline, and scenario engine.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-b bg-muted/25 px-6 py-3">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Scenario quick prompts</span>
                <p className="text-xs text-muted-foreground">Jump into pre-modelled scenarios for this persona and jurisdiction.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {quickPrompts.map(({ prompt, scenarioHint: promptScenarioHint, label }) => (
                  <Button
                    key={promptScenarioHint}
                    variant="outline"
                    size="sm"
                    className="rounded-full border-dashed px-3 text-xs"
                    onClick={() => {
                      setInput(prompt)
                      setScenarioHint(promptScenarioHint)
                    }}
                    title={label}
                  >
                    <Wand2 className="mr-1 h-3.5 w-3.5" />
                    {prompt}
                  </Button>
                ))}
              </div>
            </div>

            {chatMetadata && (
              <div className="border-b bg-muted/30 px-6 py-4 text-sm">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">Live context</div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground font-medium">Agent</span>
                    <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">{chatMetadata.agentId}</span>
                  </div>
                  <Separator orientation="vertical" className="h-5" />
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground font-medium">Jurisdictions</span>
                    <span className="text-foreground">{chatMetadata.jurisdictions.join(', ')}</span>
                  </div>
                  <Separator orientation="vertical" className="h-5" />
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground font-medium">Uncertainty</span>
                    <Badge variant={chatMetadata.uncertaintyLevel === 'high' ? 'destructive' : 'secondary'} className="ml-1">
                      {chatMetadata.uncertaintyLevel}
                    </Badge>
                  </div>
                  <Separator orientation="vertical" className="h-5" />
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground font-medium">Referenced Nodes</span>
                    <span className="text-foreground">{chatMetadata.referencedNodes.length > 0 ? chatMetadata.referencedNodes.length : 'none'}</span>
                  </div>
                </div>
              </div>
            )}

            <ChatContainer className="flex-1 bg-transparent px-4">
              {messages.length === 0 ? (
                <ChatWelcome>
                  <div className="space-y-3 rounded-2xl border bg-muted/20 p-6 shadow-inner">
                    <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                      <Sparkles className="h-4 w-4" />
                      Vercel AI starter surface
                    </div>
                    <h2 className="text-xl font-semibold">Welcome to the Regulatory Intelligence Copilot</h2>
                    <p className="text-sm text-muted-foreground">Grounded answers from a regulatory graph, not a generic chatbot.</p>
                    <div className="grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
                      <Card className="border border-blue-100 bg-blue-50/60 dark:border-blue-950 dark:bg-blue-950/30">
                        <CardHeader className="p-4">
                          <CardTitle className="text-base text-blue-600 dark:text-blue-300">Tax &amp; Company Law</CardTitle>
                          <CardDescription className="text-xs">Corporation tax, PAYE, CGT, R&amp;D credits, director obligations.</CardDescription>
                        </CardHeader>
                      </Card>
                      <Card className="border border-green-100 bg-green-50/60 dark:border-green-950 dark:bg-green-950/30">
                        <CardHeader className="p-4">
                          <CardTitle className="text-base text-green-600 dark:text-green-300">Social Welfare</CardTitle>
                          <CardDescription className="text-xs">PRSI, benefits, entitlements, contributions.</CardDescription>
                        </CardHeader>
                      </Card>
                      <Card className="border border-purple-100 bg-purple-50/60 dark:border-purple-950 dark:bg-purple-950/30">
                        <CardHeader className="p-4">
                          <CardTitle className="text-base text-purple-600 dark:text-purple-300">Pensions</CardTitle>
                          <CardDescription className="text-xs">State pension, occupational and personal schemes, funding rules.</CardDescription>
                        </CardHeader>
                      </Card>
                      <Card className="border border-amber-100 bg-amber-50/60 dark:border-amber-950 dark:bg-amber-950/30">
                        <CardHeader className="p-4">
                          <CardTitle className="text-base text-amber-600 dark:text-amber-300">EU &amp; Cross-Border</CardTitle>
                          <CardDescription className="text-xs">Social security coordination, EU regulations, cross-border tax &amp; welfare effects.</CardDescription>
                        </CardHeader>
                      </Card>
                    </div>
                    <p className="max-w-md text-xs text-muted-foreground">
                      This is a research tool built on a regulatory knowledge graph. It does not provide legal, tax, or financial advice. Always verify with qualified professionals.
                    </p>
                  </div>
                </ChatWelcome>
              ) : (
                <>
                  {messages.map((message) => (
                    <Message
                      key={message.id}
                      role={message.role}
                      content={message.content}
                      disclaimer={message.disclaimer}
                      metadata={message.metadata}
                    />
                  ))}
                  {isLoading && <MessageLoading />}
                </>
              )}
              <div ref={messagesEndRef} />
            </ChatContainer>

            <div className="border-t bg-muted/30 px-6 py-4">
              <PromptInput
                value={input}
                onChange={setInput}
                onSubmit={handleSubmit}
                placeholder="Ask about tax, welfare, pensions, or cross-border rules. The copilot will query the regulatory graph and timeline engine for you."
                disabled={isLoading}
                isLoading={isLoading}
              />
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Research assistance only · Not legal, tax, or welfare advice · All LLM calls pass through an egress guard with PII redaction.
              </p>
            </div>
          </section>

          <aside className="space-y-4">
            <Card className="border bg-card/90 shadow-lg backdrop-blur">
              <CardHeader>
                <CardTitle className="text-base">Saved conversations</CardTitle>
                <CardDescription className="text-sm">Resume recent threads and share SSE output in-session.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {conversationId && (
                  <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-xs">
                    <span className="text-muted-foreground">
                      {!isShared
                        ? 'Private to you'
                        : shareAudience === 'public'
                          ? 'Public read-only'
                          : tenantAccess === 'view'
                            ? 'Tenant shared (read-only)'
                            : 'Tenant shared (edit)'}
                    </span>
                    <Button size="sm" variant="ghost" onClick={toggleSharing}>
                      {shareAudience === 'private' ? 'Share with tenant' : 'Make private'}
                    </Button>
                  </div>
                )}
                {conversations.length === 0 && (
                  <p className="text-sm text-muted-foreground">No saved conversations yet. Ask your first question to start one.</p>
                )}
                <div className="space-y-2">
                  {conversations.map((conv) => (
                    <Button
                      key={conv.id}
                      variant={conv.id === conversationId ? 'default' : 'outline'}
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => loadConversation(conv.id)}
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="truncate text-left">{conv.title || 'Untitled conversation'}</span>
                        {conv.shareAudience !== 'private' && (
                          <Badge variant="secondary">
                            {conv.shareAudience === 'public'
                              ? 'Public read-only'
                              : conv.tenantAccess === 'view'
                                ? 'Tenant read-only'
                                : 'Tenant shared'}
                          </Badge>
                        )}
                      </span>
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border bg-card/90 shadow-lg backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BookOpenCheck className="h-4 w-4 text-primary" /> Session context
                </CardTitle>
                <CardDescription>Profile and graph context for this conversation.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-3 py-2">
                  <span className="text-muted-foreground">Persona</span>
                  <Badge variant="secondary" className="rounded-full">{profile.personaType}</Badge>
                </div>
                <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-3 py-2">
                  <span className="text-muted-foreground">Jurisdictions</span>
                  <Badge variant="outline" className="rounded-full">
                    {profile.jurisdictions.length > 0 ? profile.jurisdictions.join(', ') : 'None selected'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-3 py-2">
                  <span className="text-muted-foreground">Active graph nodes</span>
                  <Badge variant="secondary" className="rounded-full">
                    {chatMetadata?.referencedNodes?.length ? `${chatMetadata.referencedNodes.length} nodes from last answer` : 'Pending'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-3 py-2">
                  <span className="text-muted-foreground">Timeline focus</span>
                  <Badge variant="outline" className="rounded-full">Current tax year</Badge>
                </div>
                <div className="rounded-xl border bg-primary/5 px-3 py-2 text-xs text-primary">
                  These settings feed into the prompt builder, graph queries, and conversation context store. Changes take effect from the next question.
                </div>
              </CardContent>
            </Card>

            <Card className="border bg-gradient-to-b from-muted/50 via-card to-background shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4 text-primary" /> AI element highlights
                </CardTitle>
                <CardDescription>Aligned with the v0.6 architecture and engines.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-start gap-2 rounded-xl bg-muted/40 px-3 py-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                  <div>
                    <strong>Graph-backed answers</strong> – the copilot queries a Memgraph regulatory graph seeded with tax, welfare, pensions, and EU rules.
                  </div>
                </div>
                <div className="flex items-start gap-2 rounded-xl bg-muted/40 px-3 py-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                  <div>
                    <strong>Timeline-aware</strong> – a timeline engine keeps track of when rules start, end, or overlap.
                  </div>
                </div>
                <div className="flex items-start gap-2 rounded-xl bg-muted/40 px-3 py-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                  <div>
                    <strong>Scenario-aware agents</strong> – persona and jurisdiction drive which specialised agents are used.
                  </div>
                </div>
                <div className="flex items-start gap-2 rounded-xl bg-muted/40 px-3 py-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                  <div>
                    <strong>Guardrails on egress</strong> – all outbound LLM calls pass through an egress guard for redaction and policy checks.
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border bg-card/90 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ArrowUpRight className="h-4 w-4 text-primary" /> Graph view
                </CardTitle>
                <CardDescription>Inspect how rules, benefits, and obligations connect in the regulatory graph.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  Open the graph experience to see the underlying Memgraph nodes and relationships used in this answer – including tax rules, welfare schemes, pension rules, and cross-border links.
                </p>
                <Button asChild className="w-full" variant="outline">
                  <a href={`/graph?conversationId=${conversationIdRef.current}`}>Open regulatory graph</a>
                </Button>
                <p className="text-xs text-muted-foreground">
                  Opens a dedicated graph UI powered by Memgraph and the graph schema v0.6.
                </p>
              </CardContent>
            </Card>
          </aside>
        </div>
      </main>
    </div>
  )
}
