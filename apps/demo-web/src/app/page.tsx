'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { signOut, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  Archive,
  ArchiveRestore,
  AlertTriangle,
  ExternalLink,
  Loader2,
  PencilLine,
  Plus,
  Wand2,
  X,
} from 'lucide-react'
import type {
  ConversationListEventPayloadMap,
  ClientConversation,
} from '@reg-copilot/reg-intel-conversations'
import { ChatContainer, ChatWelcome } from '@/components/chat/chat-container'
import { Message, MessageLoading } from '@/components/chat/message'
import { PathToolbar } from '@/components/chat/path-toolbar'
import { ConditionalPathProvider } from '@/components/chat/conditional-path-provider'
import { getPathApiClient } from '@/lib/pathApiClient'
import { getBranchMetadata } from '@/lib/pathMessageRenderer'
import { BranchDialog } from '@reg-copilot/reg-intel-ui'
import { ProgressIndicator } from '@/components/chat/progress-indicator'
import type { StreamingStage } from '@/components/chat/progress-indicator'
import { PromptInput } from '@/components/chat/prompt-input'
import { AppHeader } from '@/components/layout/app-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  agentId?: string
  jurisdictions?: string[]
  uncertaintyLevel?: 'low' | 'medium' | 'high'
  disclaimerKey?: string
  referencedNodes?: string[]
  warnings?: string[]
  timelineSummary?: string
  timelineFocus?: string
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
type ShareOptionValue = 'private' | 'tenant-view' | 'tenant-edit' | 'public'
// Use shared ClientConversation type from the conversations package
type ConversationSummary = ClientConversation

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
    personaId?: UserProfile['personaType']
    jurisdictions?: string[]
    title?: string | null
  }
}

interface ReferencedNodeSummary {
  id: string
  label: string
  type?: string
}

interface ChatSseMetadata extends ChatMetadata {
  conversationId?: string
  shareAudience?: ShareAudience
  tenantAccess?: TenantAccess
  jurisdictions?: string[]
  title?: string | null
  archivedAt?: string | null
  lastMessageAt?: string | null
  isShared?: boolean
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
  const isValidJurisdictions =
    candidate.jurisdictions === undefined ||
    (Array.isArray(candidate.jurisdictions) && candidate.jurisdictions.every(item => typeof item === 'string'))

  return (
    (candidate.conversationId === undefined || typeof candidate.conversationId === 'string') &&
    (candidate.shareAudience === undefined || isValidShareAudience) &&
    (candidate.tenantAccess === undefined || isValidTenantAccess) &&
    (candidate.title === undefined || typeof candidate.title === 'string' || candidate.title === null) &&
    (candidate.archivedAt === undefined || typeof candidate.archivedAt === 'string' || candidate.archivedAt === null) &&
    (candidate.lastMessageAt === undefined || typeof candidate.lastMessageAt === 'string' || candidate.lastMessageAt === null) &&
    (candidate.isShared === undefined || typeof candidate.isShared === 'boolean') &&
    isValidJurisdictions
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
  const [streamingStage, setStreamingStage] = useState<StreamingStage>('analyzing')
  const [chatMetadata, setChatMetadata] = useState<ChatMetadata | null>(null)
  const [referencedNodeSummaries, setReferencedNodeSummaries] = useState<ReferencedNodeSummary[]>([])
  const [isLoadingNodeSummaries, setIsLoadingNodeSummaries] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  const [scenarioHint, setScenarioHint] = useState<string | null>(null)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [activeVersionIndex, setActiveVersionIndex] = useState<Record<string, number>>({})
  const [branchDialogOpen, setBranchDialogOpen] = useState(false)
  const [branchFromMessageId, setBranchFromMessageId] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<string | undefined>(undefined)
  const [conversationTitle, setConversationTitle] = useState<string>('')
  const [savedConversationTitle, setSavedConversationTitle] = useState<string>('')
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [conversationListTab, setConversationListTab] = useState<'active' | 'archived'>('active')
  const [shareAudience, setShareAudience] = useState<ShareAudience>('private')
  const [tenantAccess, setTenantAccess] = useState<TenantAccess>('edit')
  const [profile, setProfile] = useState<UserProfile>({
    personaType: DEFAULT_PERSONA,
    jurisdictions: ['IE'],
  })

  const isAuthenticated = status === 'authenticated' && Boolean((session?.user as { id?: string } | undefined)?.id)
  const isTitleDirty = conversationTitle !== savedConversationTitle
  const pathApiClient = useMemo(() => getPathApiClient(), [])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const editTextareaRef = useRef<HTMLTextAreaElement>(null)
  const prevMessageCountRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const conversationIdRef = useRef<string | undefined>(undefined)
  const versionedMessages = useMemo(() => buildVersionedMessages(messages), [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    const ids = chatMetadata?.referencedNodes ?? []
    if (!ids.length) {
      setReferencedNodeSummaries([])
      setIsLoadingNodeSummaries(false)
      return
    }

    const controller = new AbortController()
    const fetchSummaries = async () => {
      setIsLoadingNodeSummaries(true)
      try {
        const params = new URLSearchParams({ ids: ids.slice(0, 25).join(',') })
        const response = await fetch(`/api/graph?${params.toString()}`, { signal: controller.signal })
        if (!response.ok) {
          throw new Error(`Lookup failed with status ${response.status}`)
        }
        const payload = (await response.json()) as { nodes?: ReferencedNodeSummary[] }
        if (!controller.signal.aborted) {
          setReferencedNodeSummaries(payload.nodes ?? [])
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('Failed to fetch node summaries', error)
          setReferencedNodeSummaries([])
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingNodeSummaries(false)
        }
      }
    }

    fetchSummaries()

    return () => controller.abort()
  }, [chatMetadata?.referencedNodes])

  const loadConversations = useCallback(async (status: 'active' | 'archived' = conversationListTab) => {
    if (!isAuthenticated) return
    const response = await fetch(`/api/conversations?status=${status}`, {
      credentials: 'include',
    })
    if (!response.ok) return
    const payload = await response.json()
    setConversations(payload.conversations ?? [])
  }, [isAuthenticated, conversationListTab])

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
    loadConversations(conversationListTab)
  }, [loadConversations, conversationListTab])

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
    if (metadata.warnings !== undefined) {
      setWarnings(metadata.warnings)
    }
  }

  const selectValueFromShareState = (audience: ShareAudience, access: TenantAccess): ShareOptionValue => {
    if (audience === 'public') return 'public'
    if (audience === 'tenant' && access === 'view') return 'tenant-view'
    if (audience === 'tenant') return 'tenant-edit'
    return 'private'
  }

  const resolveShareState = (value: ShareOptionValue): { shareAudience: ShareAudience; tenantAccess: TenantAccess } => {
    switch (value) {
      case 'public':
        return { shareAudience: 'public', tenantAccess: 'view' }
      case 'tenant-view':
        return { shareAudience: 'tenant', tenantAccess: 'view' }
      case 'tenant-edit':
        return { shareAudience: 'tenant', tenantAccess: 'edit' }
      default:
        return { shareAudience: 'private', tenantAccess: tenantAccess }
    }
  }

  // Subscribe to conversations list updates for real-time changes
  useEffect(() => {
    if (!isAuthenticated) return
    const controller = new AbortController()

    const subscribe = async () => {
      try {
        const response = await fetch(`/api/conversations/stream?status=${conversationListTab}`, {
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

            if (parsedEvent.type === 'snapshot' && typeof parsedData === 'object' && parsedData !== null) {
              // Type-safe cast using unknown intermediate step
              const snapshot = parsedData as unknown as ConversationListEventPayloadMap['snapshot']
              if (snapshot.conversations) {
                setConversations(snapshot.conversations)
              }
            } else if (parsedEvent.type === 'upsert' && typeof parsedData === 'object' && parsedData !== null) {
              // Type-safe cast using unknown intermediate step
              const data = parsedData as unknown as ConversationListEventPayloadMap['upsert']
              if (data.conversation) {
                const conv = data.conversation
                // Check if conversation's archived state matches current tab filter
                const isArchived = conv.archivedAt !== null
                const shouldBeInCurrentList =
                  conversationListTab === 'active' ? !isArchived :
                  conversationListTab === 'archived' ? isArchived :
                  true // 'all' tab shows everything

                setConversations(prev => {
                  const exists = prev.some(c => c.id === conv.id)

                  // Remove from list if archived state doesn't match filter
                  if (!shouldBeInCurrentList) {
                    return prev.filter(c => c.id !== conv.id)
                  }

                  // Add if new, update if exists
                  if (!exists) return [conv, ...prev]
                  return prev.map(c => c.id === conv.id ? conv : c)
                })
                // Update current conversation metadata if it's the one being edited
                if (conv.id === conversationId) {
                  setConversationTitle(conv.title ?? '')
                  setSavedConversationTitle(conv.title ?? '')
                  setShareAudience(conv.shareAudience)
                  setTenantAccess(conv.tenantAccess)
                }
              }
            } else if (parsedEvent.type === 'deleted' && typeof parsedData === 'object' && parsedData !== null) {
              // Type-safe cast using unknown intermediate step
              const data = parsedData as unknown as ConversationListEventPayloadMap['deleted']
              setConversations(prev => prev.filter(c => c.id !== data.conversationId))
              if (data.conversationId === conversationId) {
                startNewConversation()
              }
            }
          }
        }
      } catch (error) {
        // Ignore abort errors - they're expected when cleaning up
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Conversations list stream error:', error)
        }
      }
    }

    subscribe()

    return () => {
      controller.abort()
    }
  }, [isAuthenticated, conversationListTab, conversationId])

  // Subscribe to individual conversation updates for real-time changes
  useEffect(() => {
    if (!conversationId || !isAuthenticated) return
    const controller = new AbortController()

    const subscribe = async () => {
      try {
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
      } catch (error) {
        // Ignore abort errors - they're expected when cleaning up
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Conversation stream error:', error)
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

    // Initialize streaming stage
    setStreamingStage('querying')

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
            setStreamingStage('generating') // Metadata received, now generating response
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
                prev.map(message => {
                  if (message.id === assistantMessageId) {
                    const updatedMetadata: ChatMetadata & { deletedAt?: string; supersededBy?: string } = {
                      ...message.metadata,
                      warnings: warningList
                    }
                    return { ...message, metadata: updatedMetadata }
                  }
                  return message
                })
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
            setStreamingStage('complete')
            return
          }
          case 'done':
            setStreamingStage('complete')
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

    if (!(session?.user as { id?: string } | undefined)?.id) {
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
    setStreamingStage('analyzing')
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
          title: conversationTitle,
          replaceMessageId: editingMessageId,
          userId: (session?.user as { id?: string } | undefined)?.id,
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

    // Auto-scroll to editing textarea and focus it
    setTimeout(() => {
      editTextareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      editTextareaRef.current?.focus()
    }, 100)
  }

  const cancelEditing = () => {
    setEditingMessageId(null)
    setEditingContent('')
    setInput('')
  }

  const handleEdit = (messageId: string) => {
    const message = messages.find(msg => msg.id === messageId)
    if (!message || message.role !== 'user') return
    setEditingMessageId(messageId)
    setEditingContent(message.content)
    setInput('')
  }

  const handleBranch = (messageId: string) => {
    setBranchFromMessageId(messageId)
    setBranchDialogOpen(true)
  }

  const handleBranchCreated = () => {
    // Close the dialog and reset state after successful branch creation
    setBranchDialogOpen(false)
    setBranchFromMessageId(null)
  }

  const handleViewBranch = (pathId: string) => {
    // Open the branch in a new window/tab with the pathId parameter
    if (conversationId) {
      const url = `/?conversationId=${conversationId}&pathId=${pathId}`
      window.open(url, '_blank')
    }
  }

  const updateShareSettings = async (value: ShareOptionValue) => {
    if (!conversationIdRef.current) return
    if (!isAuthenticated) return
    const nextState = resolveShareState(value)
    const response = await fetch(`/api/conversations/${conversationIdRef.current}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ shareAudience: nextState.shareAudience, tenantAccess: nextState.tenantAccess }),
    })
    if (response.ok) {
      setShareAudience(nextState.shareAudience)
      setTenantAccess(nextState.tenantAccess)
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

  const startNewConversation = () => {
    setConversationId(undefined)
    conversationIdRef.current = undefined
    setMessages([])
    setConversationTitle('')
    setSavedConversationTitle('')
    setShareAudience('private')
    setTenantAccess('edit')
    setChatMetadata(null)
    setWarnings([])
    setEditingMessageId(null)
    setEditingContent('')
    setInput('')
    setConversationListTab('active')
  }

  const toggleArchiveConversation = async (convId: string, currentlyArchived: boolean) => {
    if (!isAuthenticated) return
    const response = await fetch(`/api/conversations/${convId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ archived: !currentlyArchived }),
    })
    if (response.ok) {
      loadConversations()
      if (convId === conversationId && !currentlyArchived) {
        startNewConversation()
      }
    }
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-background via-muted/40 to-background text-foreground">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_18%,rgba(14,165,233,0.16),transparent_28%),radial-gradient(circle_at_82%_12%,rgba(236,72,153,0.14),transparent_30%),radial-gradient(circle_at_50%_65%,rgba(109,40,217,0.16),transparent_28%)] blur-3xl" />
      <AppHeader
        primaryAction={{ label: 'View Graph', href: conversationIdRef.current ? `/graph?conversationId=${conversationIdRef.current}` : '/graph' }}
        userEmail={session?.user?.email ?? (session?.user as { id?: string } | undefined)?.id ?? null}
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
          <ConditionalPathProvider
            conversationId={conversationId}
            apiClient={pathApiClient}
            onError={(err) => console.error('Path error:', err)}
          >
            <section className="flex min-h-[70vh] flex-col overflow-hidden rounded-3xl border bg-card/95 shadow-2xl backdrop-blur supports-[backdrop-filter]:border-border/80">
            <div className="flex items-center justify-between border-b bg-gradient-to-r from-muted/60 via-background to-muted/40 px-6 py-4">
              <h1 className="text-xl font-semibold tracking-tight">Regulatory Intelligence Copilot</h1>
              <Badge variant="outline" className="text-xs">Research only</Badge>
            </div>

            <div className="flex flex-wrap items-center gap-4 border-b px-6 py-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-muted-foreground">Persona</label>
                <Select
                  value={profile.personaType}
                  onValueChange={(value) => setProfile({ ...profile, personaType: value as UserProfile['personaType'] })}
                >
                  <SelectTrigger className="h-8 w-[180px] text-xs">
                    <SelectValue placeholder="Choose persona" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single-director">Single-director (IE)</SelectItem>
                    <SelectItem value="self-employed">Self-employed (IE)</SelectItem>
                    <SelectItem value="paye-employee">PAYE employee</SelectItem>
                    <SelectItem value="advisor">Advisor</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-muted-foreground">Jurisdictions</label>
                <div className="flex gap-1">
                  {['IE', 'UK', 'EU', 'NI', 'IM'].map((jur) => (
                    <Badge
                      key={jur}
                      onClick={() => toggleJurisdiction(jur)}
                      variant={profile.jurisdictions.includes(jur) ? 'default' : 'outline'}
                      className="cursor-pointer px-2 py-0.5 text-xs"
                    >
                      {jur}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="ml-auto flex items-center gap-2">
                {conversationId && (
                  <PathToolbar compact className="mr-2" />
                )}
                {quickPrompts.slice(0, 2).map(({ scenarioHint: promptScenarioHint, label }) => (
                  <Button
                    key={promptScenarioHint}
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      const prompt = quickPrompts.find(p => p.scenarioHint === promptScenarioHint)?.prompt ?? ''
                      setInput(prompt)
                      setScenarioHint(promptScenarioHint)
                    }}
                  >
                    <Wand2 className="mr-1 h-3 w-3" />
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            {(chatMetadata || isLoading) && (
              <div className="flex items-center gap-3 border-b bg-muted/20 px-6 py-2 text-xs text-muted-foreground">
                {isLoading && (
                  <span className="flex items-center gap-1 text-primary">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Streaming
                  </span>
                )}
                {chatMetadata?.agentId && (
                  <span>Agent: <span className="text-foreground">{chatMetadata.agentId}</span></span>
                )}
                {chatMetadata?.jurisdictions && chatMetadata.jurisdictions.length > 0 && (
                  <span>Scope: <span className="text-foreground">{chatMetadata.jurisdictions.join(', ')}</span></span>
                )}
                {chatMetadata?.referencedNodes && chatMetadata.referencedNodes.length > 0 && (
                  <a
                    href={conversationIdRef.current ? `/graph?conversationId=${conversationIdRef.current}` : '/graph'}
                    className="flex items-center gap-1 text-primary hover:underline"
                  >
                    {chatMetadata.referencedNodes.length} graph refs
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {chatMetadata?.uncertaintyLevel && (
                  <Badge
                    variant={chatMetadata.uncertaintyLevel === 'high' ? 'destructive' : chatMetadata.uncertaintyLevel === 'medium' ? 'secondary' : 'outline'}
                    className="text-[10px]"
                  >
                    {chatMetadata.uncertaintyLevel} confidence
                  </Badge>
                )}
              </div>
            )}

            {warnings.length > 0 && (
              <div className="mx-4 mt-2 space-y-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {warnings.map((warning, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>{warning}</span>
                  </div>
                ))}
              </div>
            )}

            <ChatContainer className="flex-1 bg-transparent px-4">
              {versionedMessages.length === 0 ? (
                <ChatWelcome>
                  <div className="mx-auto max-w-lg space-y-4 py-8 text-center">
                    <h2 className="text-xl font-semibold">Welcome to the Regulatory Intelligence Copilot</h2>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Grounded answers from a regulatory knowledge graph—not a generic chatbot. Coverage includes corporation tax, PAYE, CGT, R&amp;D credits, director obligations, PRSI, benefits, entitlements, contributions, state pension, occupational and personal schemes, funding rules, social security coordination, EU regulations, and cross-border tax &amp; welfare effects.
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {quickPrompts.map(({ label, prompt, scenarioHint: promptScenarioHint }) => (
                        <Button
                          key={promptScenarioHint}
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => {
                            setInput(prompt)
                            setScenarioHint(promptScenarioHint)
                          }}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
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
                        {isEditingCurrent ? (
                          <div className="rounded-2xl border bg-muted/40 p-4 shadow-sm">
                            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                              <PencilLine className="h-4 w-4" /> Editing last message
                            </div>
                            <Label htmlFor={`edit-${chain.latestId}`} className="sr-only">
                              Edit message
                            </Label>
                            <textarea
                              ref={editTextareaRef}
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
                            showVersionNav={hasHistory}
                            currentVersionIndex={currentIndex}
                            totalVersions={chain.versions.length}
                            versionTimestamp={new Date()}
                            onPreviousVersion={goPrevious}
                            onNextVersion={goNext}
                            messageId={currentMessage.id}
                            onEdit={handleEdit}
                            onBranch={handleBranch}
                            showActions={true}
                            isBranchPoint={getBranchMetadata(currentMessage).isBranchPoint}
                            branchedPaths={getBranchMetadata(currentMessage).branchIds}
                            onViewBranch={handleViewBranch}
                          />
                        )}
                      </div>
                    )
                  })}
                  {isLoading && (
                    <>
                      <ProgressIndicator currentStage={streamingStage} />
                      <MessageLoading />
                    </>
                  )}
                </>
              )}
              <div ref={messagesEndRef} />
            </ChatContainer>

            <div className="border-t bg-muted/30 px-6 py-3">
              <div className="mb-2 flex items-center justify-end gap-2">
                {editingMessageId && (
                  <Button size="sm" variant="ghost" onClick={cancelEditing} disabled={isLoading}>
                    Cancel
                  </Button>
                )}
                {versionedMessages.length > 0 && !editingMessageId && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={startEditingLastMessage}
                    disabled={isLoading || !isAuthenticated}
                  >
                    <PencilLine className="mr-1 h-3 w-3" />
                    Edit last
                  </Button>
                )}
              </div>
              <PromptInput
                value={input}
                onChange={setInput}
                onSubmit={handleSubmit}
                placeholder="Ask about tax, welfare, pensions, or cross-border rules..."
                disabled={isLoading || !isAuthenticated || Boolean(editingMessageId)}
                isLoading={isLoading}
              />
              <p className="mt-2 text-center text-[10px] text-muted-foreground">
                Research only · Not legal/tax advice
              </p>
            </div>
          </section>

          {/* Branch Dialog - must be inside provider to use useConversationPaths */}
          {branchFromMessageId && (
            <BranchDialog
              open={branchDialogOpen}
              onOpenChange={setBranchDialogOpen}
              messageId={branchFromMessageId}
              onBranchCreated={handleBranchCreated}
            />
          )}
          </ConditionalPathProvider>

          <aside className="space-y-4">
            <Card className="border bg-card/90 shadow-lg backdrop-blur">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Conversations</CardTitle>
                  <Button
                    size="sm"
                    onClick={startNewConversation}
                    disabled={!isAuthenticated}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    New
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-1 rounded-lg border bg-muted/30 p-1">
                  <Button
                    variant={conversationListTab === 'active' ? 'default' : 'ghost'}
                    size="sm"
                    className="flex-1"
                    onClick={() => setConversationListTab('active')}
                  >
                    Active
                  </Button>
                  <Button
                    variant={conversationListTab === 'archived' ? 'default' : 'ghost'}
                    size="sm"
                    className="flex-1"
                    onClick={() => setConversationListTab('archived')}
                  >
                    Archived
                  </Button>
                </div>

                {conversationId && (
                  <div className="space-y-2 rounded-lg border px-3 py-2">
                    <div className="flex gap-2">
                      <Input
                        value={conversationTitle}
                        onChange={event => {
                          setConversationTitle(event.target.value)
                          setIsEditingTitle(true)
                        }}
                        onFocus={() => setIsEditingTitle(true)}
                        onBlur={() => setIsEditingTitle(false)}
                        placeholder="Add title..."
                        className="h-8 text-sm"
                      />
                      {(isEditingTitle || isTitleDirty) && (
                        <Button size="sm" onClick={saveConversationTitle} disabled={isLoading || !isAuthenticated}>
                          Save
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={selectValueFromShareState(shareAudience, tenantAccess)}
                        onValueChange={value => updateShareSettings(value as ShareOptionValue)}
                        disabled={!isAuthenticated}
                      >
                        <SelectTrigger className="h-8 flex-1 text-xs">
                          <SelectValue placeholder="Sharing" />
                        </SelectTrigger>
                        <SelectContent align="end">
                          <SelectItem value="private">Private</SelectItem>
                          <SelectItem value="tenant-view">Tenant: view</SelectItem>
                          <SelectItem value="tenant-edit">Tenant: edit</SelectItem>
                          <SelectItem value="public">Public</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {conversations.length === 0 && (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    {conversationListTab === 'active'
                      ? 'No conversations yet'
                      : 'No archived conversations'}
                  </p>
                )}
                <div className="max-h-[300px] space-y-1 overflow-y-auto">
                  {conversations.map((conv) => (
                    <div
                      key={conv.id}
                      className={`group flex items-center gap-1 rounded-md border p-1 ${
                        conv.id === conversationId ? 'border-primary bg-primary/10' : 'hover:bg-muted/50'
                      }`}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto flex-1 justify-start px-2 py-1.5 text-left"
                        onClick={() => loadConversation(conv.id)}
                      >
                        <span className="truncate text-sm">{conv.title || 'Untitled'}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleArchiveConversation(conv.id, Boolean(conv.archivedAt))
                        }}
                        title={conv.archivedAt ? 'Restore' : 'Archive'}
                      >
                        {conv.archivedAt ? (
                          <ArchiveRestore className="h-4 w-4" />
                        ) : (
                          <Archive className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {(referencedNodeSummaries.length > 0 || isLoadingNodeSummaries) && (
              <Card className="border bg-card/90 shadow-lg backdrop-blur">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-sm">
                    <span>Graph Context</span>
                    <Button asChild variant="ghost" size="sm" className="h-6 px-2 text-xs">
                      <a href={conversationIdRef.current ? `/graph?conversationId=${conversationIdRef.current}` : '/graph'}>
                        Open Graph
                        <ExternalLink className="ml-1 h-3 w-3" />
                      </a>
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {isLoadingNodeSummaries && (
                    <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading graph references...
                    </div>
                  )}
                  {!isLoadingNodeSummaries && referencedNodeSummaries.length === 0 && chatMetadata?.referencedNodes?.length && (
                    <p className="py-2 text-xs text-muted-foreground">
                      {chatMetadata.referencedNodes.length} nodes referenced
                    </p>
                  )}
                  <div className="max-h-[200px] space-y-1 overflow-y-auto">
                    {referencedNodeSummaries.map(node => (
                      <a
                        key={node.id}
                        href={`/graph?nodeId=${encodeURIComponent(node.id)}${conversationIdRef.current ? `&conversationId=${conversationIdRef.current}` : ''}`}
                        className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs hover:bg-muted/50"
                      >
                        <div className="flex-1 truncate">
                          <span className="font-medium">{node.label}</span>
                          {node.type && (
                            <span className="ml-1 text-muted-foreground">({node.type})</span>
                          )}
                        </div>
                        <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                      </a>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </aside>
        </div>
      </main>
    </div>
  )
}
