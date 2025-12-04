'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { signOut, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  AlertTriangle,
  BookOpenCheck,
  Globe2,
  PencilLine,
  ShieldHalf,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react'

import { ChatContainer, ChatWelcome } from '@/components/chat/chat-container'
import { Message, MessageLoading } from '@/components/chat/message'
import { PromptInput } from '@/components/chat/prompt-input'
import { AppHeader } from '@/components/layout/app-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  personaType: 'single-director' | 'self-employed' | 'paye-employee' | 'advisor'
  jurisdictions: string[]
}

interface ChatMetadata {
  agentId: string
  jurisdictions: string[]
  uncertaintyLevel: 'low' | 'medium' | 'high'
  disclaimerKey: string
  referencedNodes: string[]
  warnings?: string[]
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  disclaimer?: string
  metadata?: ChatMetadata & { deletedAt?: string; supersededBy?: string }
  deletedAt?: string | null
  supersededBy?: string | null
}

interface VersionedMessage {
  latestId: string
  versions: ChatMessage[]
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
  metadata?: ChatMetadata & { deletedAt?: string; supersededBy?: string }
  deletedAt?: string | null
  supersededBy?: string | null
}

interface ConversationPayload {
  messages?: ApiMessage[]
  conversation?: {
    shareAudience?: ShareAudience
    tenantAccess?: TenantAccess
    authorizationModel?: AuthorizationModel
    personaId?: UserProfile['personaType']
    jurisdictions?: string[]
    title?: string | null
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
  const hasValidWarnings =
    candidate.warnings === undefined ||
    (Array.isArray(candidate.warnings) && candidate.warnings.every(item => typeof item === 'string'))
  return (
    typeof candidate.agentId === 'string' &&
    Array.isArray(candidate.jurisdictions) &&
    typeof candidate.uncertaintyLevel === 'string' &&
    typeof candidate.disclaimerKey === 'string' &&
    Array.isArray(candidate.referencedNodes) &&
    hasValidWarnings
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

const extractWarnings = (parsedData: ParsedSseData): string[] => {
  if (Array.isArray(parsedData) && parsedData.every(item => typeof item === 'string')) {
    return parsedData
  }
  if (
    typeof parsedData === 'object' &&
    parsedData !== null &&
    'warnings' in parsedData &&
    Array.isArray((parsedData as { warnings?: unknown }).warnings)
  ) {
    const candidate = (parsedData as { warnings?: unknown }).warnings
    return Array.isArray(candidate) ? candidate.filter((item): item is string => typeof item === 'string') : []
  }
  if (typeof parsedData === 'string' && parsedData.trim().length > 0) {
    return [parsedData]
  }
  return []
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

const DEFAULT_PERSONA: UserProfile['personaType'] = 'single-director'

const normalizePersonaType = (value?: string | null): UserProfile['personaType'] => {
  if (!value) return DEFAULT_PERSONA
  const normalized = value.toLowerCase()
  if (normalized.startsWith('self-employed')) return 'self-employed'
  if (normalized.startsWith('paye')) return 'paye-employee'
  if (normalized.startsWith('advisor')) return 'advisor'
  if (normalized.startsWith('single-director')) return 'single-director'
  return DEFAULT_PERSONA
}

const buildVersionedMessages = (messages: ChatMessage[]): VersionedMessage[] => {
  const messageMap = new Map(messages.map(message => [message.id, message]))
  const predecessor = new Map<string, string>()

  messages.forEach(message => {
    const successorId = message.supersededBy ?? message.metadata?.supersededBy
    if (successorId) {
      predecessor.set(successorId, message.id)
    }
  })

  const findLatest = (messageId: string): string => {
    let current = messageId
    let next = messageMap.get(current)?.supersededBy ?? messageMap.get(current)?.metadata?.supersededBy
    while (next && messageMap.has(next)) {
      current = next
      next = messageMap.get(current)?.supersededBy ?? messageMap.get(current)?.metadata?.supersededBy
    }
    return current
  }

  const orderedLatestIds: string[] = []
  const seenLatest = new Set<string>()
  messages.forEach(message => {
    const latestId = findLatest(message.id)
    if (!seenLatest.has(latestId)) {
      orderedLatestIds.push(latestId)
      seenLatest.add(latestId)
    }
  })

  const chains: VersionedMessage[] = orderedLatestIds.map(latestId => {
    const versions: ChatMessage[] = []
    let cursor: string | undefined = latestId

    while (cursor) {
      const current = messageMap.get(cursor)
      if (current) {
        versions.unshift(current)
      }
      cursor = predecessor.get(cursor)
    }

    return { latestId, versions }
  })

  return chains
}

export default function Home() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [chatMetadata, setChatMetadata] = useState<ChatMetadata | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [scenarioHint, setScenarioHint] = useState<string | null>(null)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [activeVersionIndex, setActiveVersionIndex] = useState<Record<string, number>>({})
  const [conversationId, setConversationId] = useState<string | undefined>(undefined)
  const [conversationTitle, setConversationTitle] = useState<string>('')
  const [savedConversationTitle, setSavedConversationTitle] = useState<string>('')
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [shareAudience, setShareAudience] = useState<ShareAudience>('private')
  const [tenantAccess, setTenantAccess] = useState<TenantAccess>('edit')
  const [authorizationModel, setAuthorizationModel] = useState<AuthorizationModel>('supabase_rbac')
  const [profile, setProfile] = useState<UserProfile>({
    personaType: DEFAULT_PERSONA,
    jurisdictions: ['IE'],
  })
  const isShared = shareAudience !== 'private'

  const isAuthenticated = status === 'authenticated' && Boolean(session?.user?.id)
  const isTitleDirty = conversationTitle !== savedConversationTitle

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const prevMessageCountRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const conversationIdRef = useRef<string | undefined>(undefined)
  const versionedMessages = useMemo(() => buildVersionedMessages(messages), [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const loadConversations = useCallback(async () => {
    if (!isAuthenticated) return
    const response = await fetch(`/api/conversations`, {
      credentials: 'include',
    })
    if (!response.ok) return
    const payload = await response.json()
    setConversations(payload.conversations ?? [])
  }, [isAuthenticated])

  const loadConversation = useCallback(
    async (id: string) => {
      if (!isAuthenticated) return
      const response = await fetch(`/api/conversations/${id}`, {
        credentials: 'include',
      })
      if (!response.ok) return
      const payload: ConversationPayload = await response.json()
      const loadedMessages: ChatMessage[] = (payload.messages ?? []).map(msg => ({
        id: msg.id ?? crypto.randomUUID(),
        role: msg.role,
        content: msg.content,
        metadata: msg.metadata,
        deletedAt: msg.deletedAt ?? msg.metadata?.deletedAt ?? null,
        supersededBy: msg.supersededBy ?? msg.metadata?.supersededBy ?? null,
      }))
      setMessages(loadedMessages)
      setConversationId(id)
      conversationIdRef.current = id
      setEditingMessageId(null)
      setShareAudience(payload.conversation?.shareAudience ?? 'private')
      setTenantAccess(payload.conversation?.tenantAccess ?? 'edit')
      setAuthorizationModel(payload.conversation?.authorizationModel ?? 'supabase_rbac')
      const personaId = payload.conversation?.personaId
      if (personaId) {
        setProfile(prev => ({ ...prev, personaType: normalizePersonaType(personaId) }))
      }
      const jurisdictions = payload.conversation?.jurisdictions
      if (jurisdictions) {
        setProfile(prev => ({ ...prev, jurisdictions }))
      }
      const titleValue = payload.conversation?.title ?? ''
      setConversationTitle(titleValue)
      setSavedConversationTitle(titleValue)
      const latestWarningMetadata = [...loadedMessages]
        .reverse()
        .find(message => message.role === 'assistant' && message.metadata?.warnings?.length)
      setWarnings(latestWarningMetadata?.metadata?.warnings ?? [])
    },
    [isAuthenticated]
  )

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  // Only scroll when a new message is added
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      scrollToBottom()
    }
    prevMessageCountRef.current = messages.length
  }, [messages.length])

  useEffect(() => {
    setActiveVersionIndex(prev => {
      const next = { ...prev }
      versionedMessages.forEach(chain => {
        const maxIndex = chain.versions.length - 1
        if (!(chain.latestId in next) || next[chain.latestId] > maxIndex) {
          next[chain.latestId] = maxIndex
        }
      })
      return next
    })
  }, [versionedMessages])

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
    if (metadata.warnings !== undefined) {
      setWarnings(metadata.warnings)
    }
  }

  useEffect(() => {
    if (!conversationId || !isAuthenticated) return
    const controller = new AbortController()

    const subscribe = async () => {
      const response = await fetch(`/api/conversations/${conversationId}/stream`, {
        signal: controller.signal,
        credentials: 'include',
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
          } else if (parsedEvent.type === 'warning') {
            const warningList = extractWarnings(parsedData)
            if (warningList.length) {
              setWarnings(warningList)
              setChatMetadata(prev => (prev ? { ...prev, warnings: warningList } : prev))
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
  }, [conversationId, isAuthenticated, loadConversation])

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
            if (parsedData.warnings !== undefined) {
              setWarnings(parsedData.warnings)
            }
            setMessages(prev =>
              prev.map(message =>
                message.id === assistantMessageId ? { ...message, metadata: parsedData } : message
              )
            )
            break
          }
          case 'warning': {
            const warningList = extractWarnings(parsedData)
            if (warningList.length) {
              setWarnings(warningList)
              setChatMetadata(prev => (prev ? { ...prev, warnings: warningList } : prev))
              setMessages(prev =>
                prev.map(message =>
                  message.id === assistantMessageId
                    ? { ...message, metadata: { ...message.metadata, warnings: warningList } }
                    : message
                )
              )
            }
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
    const messageText = (editingMessageId ? editingContent : input).trim()
    if (!messageText) return

    if (!session?.user?.id) {
      router.push('/login')
      return
    }

    const assistantMessage: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: '' }
    const nowIso = new Date().toISOString()
    const newUserMessageId = editingMessageId ? crypto.randomUUID() : undefined

    setMessages(prev => {
      if (!editingMessageId) {
        return [
          ...prev,
          { id: crypto.randomUUID(), role: 'user', content: messageText },
          assistantMessage,
        ]
      }

      return [
        ...prev.map(message =>
          message.id === editingMessageId
            ? {
                ...message,
                deletedAt: message.deletedAt ?? nowIso,
                supersededBy: newUserMessageId,
                metadata: {
                  ...message.metadata,
                  deletedAt: message.metadata?.deletedAt ?? nowIso,
                  supersededBy: newUserMessageId,
                },
              }
            : message
        ),
        { id: newUserMessageId ?? crypto.randomUUID(), role: 'user', content: messageText },
        assistantMessage,
      ]
    })

    if (!editingMessageId) {
      setInput('')
    }
    setEditingContent('')
    setIsLoading(true)
    setChatMetadata(null)
    setWarnings([])

    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          conversationId: conversationIdRef.current,
          message: messageText,
          profile,
          scenarioHint,
          shareAudience,
          tenantAccess,
          authorizationModel,
          title: conversationTitle,
          replaceMessageId: editingMessageId,
          userId: session.user.id,
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
      setEditingMessageId(null)
      setEditingContent('')
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

  const lastEditableUserMessage = () => {
    for (let i = versionedMessages.length - 1; i >= 0; i -= 1) {
      const chain = versionedMessages[i]
      const currentIndex = activeVersionIndex[chain.latestId] ?? chain.versions.length - 1
      const candidate = chain.versions[currentIndex]
      if (candidate.role === 'user' && !candidate.deletedAt && !candidate.metadata?.deletedAt) {
        return candidate
      }
    }
    return null
  }

  const startEditingLastMessage = () => {
    const lastMessage = lastEditableUserMessage()
    if (!lastMessage) return
    setEditingMessageId(lastMessage.id)
    setEditingContent(lastMessage.content)
    setInput('')
  }

  const cancelEditing = () => {
    setEditingMessageId(null)
    setEditingContent('')
    setInput('')
  }

  const toggleSharing = async () => {
    if (!conversationIdRef.current) return
    if (!isAuthenticated) return
    const nextAudience: ShareAudience = shareAudience === 'private' ? 'tenant' : 'private'
    const nextTenantAccess: TenantAccess = nextAudience === 'tenant' ? 'edit' : tenantAccess
    const response = await fetch(`/api/conversations/${conversationIdRef.current}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ shareAudience: nextAudience, tenantAccess: nextTenantAccess }),
    })
    if (response.ok) {
      setShareAudience(nextAudience)
      setTenantAccess(nextTenantAccess)
      loadConversations()
    }
  }

  const saveConversationTitle = async () => {
    if (!conversationIdRef.current) return
    if (!isAuthenticated) return
    const response = await fetch(`/api/conversations/${conversationIdRef.current}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ title: conversationTitle || null }),
    })
    if (response.ok) {
      loadConversations()
      setSavedConversationTitle(conversationTitle)
      setIsEditingTitle(false)
    }
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-background via-muted/40 to-background text-foreground">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_18%,rgba(14,165,233,0.16),transparent_28%),radial-gradient(circle_at_82%_12%,rgba(236,72,153,0.14),transparent_30%),radial-gradient(circle_at_50%_65%,rgba(109,40,217,0.16),transparent_28%)] blur-3xl" />
      <AppHeader
        primaryAction={{ label: 'View Graph', href: `/graph?conversationId=${conversationIdRef.current}` }}
        userEmail={session?.user?.email ?? session?.user?.id ?? null}
        onSignOut={() => signOut({ callbackUrl: '/login' })}
      />

      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-12 pt-8">
        {status === 'unauthenticated' && (
          <Card className="border-amber-300/70 bg-amber-50 text-amber-900">
            <CardHeader>
              <CardTitle>Sign in to use the copilot</CardTitle>
              <CardDescription>
                Use the seeded Supabase credentials from <code className="rounded bg-amber-100 px-1 py-0.5">supabase/seed/demo_seed.sql</code>{' '}
                to authenticate before chatting.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => router.push('/login')}>
                Go to login
              </Button>
            </CardContent>
          </Card>
        )}

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
                    <SelectItem value="single-director">Single-director company (IE)</SelectItem>
                    <SelectItem value="self-employed">Self-employed / contractor (IE)</SelectItem>
                    <SelectItem value="paye-employee">PAYE employee with EU ties</SelectItem>
                    <SelectItem value="advisor">Cross-border / advisor lens</SelectItem>
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

            {warnings.length > 0 && (
              <div className="mx-4 mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Graph unavailable</span>
                </div>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {warnings.map((warning, index) => (
                    <li key={`${warning}-${index}`}>{warning}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-amber-800">
                  Chat will continue, but referenced relationships may be missing until the Memgraph service is reachable.
                </p>
              </div>
            )}

            <ChatContainer className="flex-1 bg-transparent px-4">
              {versionedMessages.length === 0 ? (
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
                  {versionedMessages.map(chain => {
                    const currentIndex = activeVersionIndex[chain.latestId] ?? chain.versions.length - 1
                    const currentMessage = chain.versions[currentIndex]
                    const hasHistory = chain.versions.length > 1
                    const goPrevious = () =>
                      setActiveVersionIndex(prev => ({ ...prev, [chain.latestId]: Math.max(0, currentIndex - 1) }))
                    const goNext = () =>
                      setActiveVersionIndex(prev => ({
                        ...prev,
                        [chain.latestId]: Math.min(chain.versions.length - 1, currentIndex + 1),
                      }))
                    const isEditingChain = editingMessageId ? chain.versions.some(msg => msg.id === editingMessageId) : false
                    const isEditingCurrent = isEditingChain && currentMessage.role === 'user'

                    return (
                      <div key={chain.latestId} className="relative">
                        {hasHistory && (
                          <div className="absolute -left-12 top-3 z-10 flex items-center gap-1 text-muted-foreground">
                            <Button size="icon" variant="ghost" onClick={goPrevious} disabled={currentIndex === 0}>
                              <ArrowLeft className="h-4 w-4" />
                            </Button>
                            <span className="text-xs font-medium">
                              {currentIndex + 1} / {chain.versions.length}
                            </span>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={goNext}
                              disabled={currentIndex === chain.versions.length - 1}
                            >
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                          </div>
                        )}

                        {isEditingCurrent ? (
                          <div className="rounded-2xl border bg-muted/40 p-4 shadow-sm">
                            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                              <PencilLine className="h-4 w-4" /> Editing last message
                            </div>
                            <Label htmlFor={`edit-${chain.latestId}`} className="sr-only">
                              Edit message
                            </Label>
                            <textarea
                              id={`edit-${chain.latestId}`}
                              value={editingContent}
                              onChange={event => setEditingContent(event.target.value)}
                              className="w-full resize-none rounded-xl border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none"
                              rows={3}
                              disabled={isLoading}
                            />
                            <div className="mt-2 flex items-center justify-end gap-2">
                              <Button size="sm" variant="ghost" onClick={cancelEditing} disabled={isLoading}>
                                <X className="mr-1 h-4 w-4" /> Cancel
                              </Button>
                              <Button size="sm" onClick={handleSubmit} disabled={isLoading || !editingContent.trim()}>
                                <PencilLine className="mr-1 h-4 w-4" /> Save edit
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Message
                            role={currentMessage.role}
                            content={currentMessage.content}
                            disclaimer={currentMessage.disclaimer}
                            metadata={currentMessage.metadata}
                            deletedAt={currentMessage.deletedAt}
                            supersededBy={currentMessage.supersededBy}
                          />
                        )}
                      </div>
                    )
                  })}
                  {isLoading && <MessageLoading />}
                </>
              )}
              <div ref={messagesEndRef} />
            </ChatContainer>

            <div className="border-t bg-muted/30 px-6 py-4">
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {editingMessageId
                    ? 'Editing your last message. Submit to replace it, or cancel to keep the original.'
                    : isAuthenticated
                      ? 'Send a new prompt or edit your last message to update the thread.'
                      : 'Sign in to start chatting with the copilot.'}
                </span>
                <div className="flex items-center gap-2">
                  {editingMessageId && (
                    <Button size="sm" variant="ghost" onClick={cancelEditing} disabled={isLoading}>
                      Cancel edit
                    </Button>
                  )}
                  {versionedMessages.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={startEditingLastMessage}
                      disabled={isLoading || !isAuthenticated}
                    >
                      Edit last message
                    </Button>
                  )}
                </div>
              </div>
              <PromptInput
                value={input}
                onChange={setInput}
                onSubmit={handleSubmit}
                placeholder="Ask about tax, welfare, pensions, or cross-border rules. The copilot will query the regulatory graph and timeline engine for you."
                disabled={isLoading || !isAuthenticated || Boolean(editingMessageId)}
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
                {conversationId && (
                  <div className="space-y-2 rounded-lg border px-3 py-2">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      Conversation title
                    </label>
                    <div className="flex gap-2">
                      <Input
                        value={conversationTitle}
                        onChange={event => {
                          setConversationTitle(event.target.value)
                          setIsEditingTitle(true)
                        }}
                        onFocus={() => setIsEditingTitle(true)}
                        onBlur={() => setIsEditingTitle(false)}
                        placeholder="Add a title for this thread"
                      />
                      {(isEditingTitle || isTitleDirty) && (
                        <Button size="sm" onClick={saveConversationTitle} disabled={isLoading || !isAuthenticated}>
                          Save
                        </Button>
                      )}
                    </div>
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
