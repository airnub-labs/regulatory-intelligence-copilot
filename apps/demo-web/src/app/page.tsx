'use client';

import { useEffect, useRef, useState } from 'react';
import { DEFAULT_PROFILE_ID } from '@reg-copilot/reg-intel-core/client';
import { AppHeader } from '@/components/layout/app-header';
import { Message, MessageLoading } from '@/components/chat/message';
import { ChatContainer, ChatWelcome } from '@/components/chat/chat-container';
import { PromptInput } from '@/components/chat/prompt-input';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * User profile for regulatory context
 */
interface UserProfile {
  personaType: 'self-employed' | 'single-director' | 'paye-employee' | 'investor' | 'advisor';
  jurisdictions: string[];
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ChatMetadata {
  agentId: string;
  jurisdictions: string[];
  uncertaintyLevel: 'low' | 'medium' | 'high';
  disclaimerKey: string;
  referencedNodes: string[];
}

function parseSseEvent(eventBlock: string): { type: string; data: string } | null {
  const lines = eventBlock.split('\n');
  let eventType = 'message';
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('event:')) {
      eventType = line.replace('event:', '').trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.replace('data:', '').trim());
    }
  }

  if (!eventType && dataLines.length === 0) return null;

  return {
    type: eventType,
    data: dataLines.join('\n'),
  };
}

function parseJsonSafe(value: string) {
  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn('Failed to parse SSE data', error);
    return value;
  }
}

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatMetadata, setChatMetadata] = useState<ChatMetadata | null>(null);
  const [profile, setProfile] = useState<UserProfile>({
    personaType: DEFAULT_PROFILE_ID,
    jurisdictions: ['IE'],
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Only scroll when a new message is added
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      scrollToBottom();
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length]);

  const streamChatResponse = async (response: Response, assistantMessageId: string) => {
    if (!response.body) {
      throw new Error('Response stream missing');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const appendAssistantText = (delta: string) => {
      setMessages(prev =>
        prev.map(message =>
          message.id === assistantMessageId ? { ...message, content: `${message.content}${delta}` } : message
        )
      );
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let boundaryIndex;
      while ((boundaryIndex = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, boundaryIndex).trim();
        buffer = buffer.slice(boundaryIndex + 2);

        if (!rawEvent) continue;
        const parsedEvent = parseSseEvent(rawEvent);
        if (!parsedEvent) continue;

        const parsedData = parseJsonSafe(parsedEvent.data);

        switch (parsedEvent.type) {
          case 'metadata':
            setChatMetadata(parsedData as ChatMetadata);
            break;
          case 'message': {
            const textChunk = typeof parsedData === 'string' ? parsedData : parsedData?.text ?? '';
            appendAssistantText(textChunk);
            break;
          }
          case 'error': {
            const errorMessage = typeof parsedData === 'string' ? parsedData : parsedData?.message ?? 'Unknown error';
            appendAssistantText(`Error: ${errorMessage}`);
            return;
          }
          case 'done':
            return;
          default:
            break;
        }
      }
    }
  };

  const handleSubmit = async () => {
    if (!input.trim()) return;

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: input.trim() };
    const assistantMessage: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: '' };

    const outgoingMessages = [...messages, userMessage];

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setInput('');
    setIsLoading(true);
    setChatMetadata(null);

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: outgoingMessages.map(({ role, content }) => ({ role, content })), profile }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      await streamChatResponse(response, assistantMessage.id);
    } catch (error) {
      const fallback = error instanceof Error ? error.message : 'Unknown error';
      setMessages(prev =>
        prev.map(message =>
          message.id === assistantMessage.id ? { ...message, content: `Error: ${fallback}` } : message
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-background via-muted/40 to-background text-foreground">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.18),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(168,85,247,0.18),transparent_35%)] blur-3xl" />
      <AppHeader />

      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-10 pt-8">
        <section className="overflow-hidden rounded-2xl border bg-card/80 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-4 border-b bg-muted/40 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-muted-foreground">Active research profile</p>
              <h1 className="text-2xl font-bold tracking-tight">Regulatory Intelligence Copilot 🧭</h1>
              <p className="text-sm text-muted-foreground">
                Persona-aware answers grounded in jurisdictions you select below.
              </p>
            </div>
            <Badge variant="secondary" className="w-fit rounded-full bg-primary/10 text-primary">
              Vercel AI chat-inspired experience
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-6 px-5 py-4">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Persona</label>
              <Select
                value={profile.personaType}
                onValueChange={(value) =>
                  setProfile({ ...profile, personaType: value as UserProfile['personaType'] })
                }
              >
                <SelectTrigger className="w-[260px]">
                  <SelectValue placeholder="Choose persona" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single-director">Single Director Company (IE)</SelectItem>
                  <SelectItem value="self-employed">Self-Employed</SelectItem>
                  <SelectItem value="paye-employee">PAYE Employee</SelectItem>
                  <SelectItem value="investor">Investor (CGT)</SelectItem>
                  <SelectItem value="advisor">Tax/Welfare Advisor</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator orientation="vertical" className="hidden h-14 md:block" />

            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Jurisdictions</label>
              <div className="flex flex-wrap gap-2">
                {['IE', 'EU', 'MT', 'IM'].map((jur) => (
                  <Badge
                    key={jur}
                    onClick={() => {
                      const current = profile.jurisdictions;
                      if (current.includes(jur)) {
                        setProfile({ ...profile, jurisdictions: current.filter(j => j !== jur) });
                      } else {
                        setProfile({ ...profile, jurisdictions: [...current, jur] });
                      }
                    }}
                    variant={profile.jurisdictions.includes(jur) ? "default" : "outline"}
                    className="cursor-pointer rounded-full px-3 py-1 text-sm transition hover:translate-y-[-1px] hover:shadow-sm"
                  >
                    {jur}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="flex min-h-[70vh] flex-col overflow-hidden rounded-3xl border bg-card/90 shadow-xl backdrop-blur">
          {chatMetadata && (
            <div className="border-b bg-muted/30 px-5 py-4 text-sm">
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

          <ChatContainer className="flex-1 bg-transparent px-5 py-4">
            {messages.length === 0 ? (
              <ChatWelcome>
                <h2 className="text-xl font-semibold">Welcome to the Regulatory Intelligence Copilot!</h2>
                <p className="text-sm text-muted-foreground">Ask questions about:</p>
                <div className="grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
                  <Card className="border border-blue-100 bg-blue-50/60 dark:border-blue-950 dark:bg-blue-950/30">
                    <CardHeader className="p-4">
                      <CardTitle className="text-base text-blue-600 dark:text-blue-300">Tax & Company Law</CardTitle>
                      <CardDescription className="text-xs">
                        Corporation tax, CGT, R&D credits, director obligations
                      </CardDescription>
                    </CardHeader>
                  </Card>
                  <Card className="border border-green-100 bg-green-50/60 dark:border-green-950 dark:bg-green-950/30">
                    <CardHeader className="p-4">
                      <CardTitle className="text-base text-green-600 dark:text-green-300">Social Welfare</CardTitle>
                      <CardDescription className="text-xs">
                        PRSI, benefits, entitlements, contributions
                      </CardDescription>
                    </CardHeader>
                  </Card>
                  <Card className="border border-purple-100 bg-purple-50/60 dark:border-purple-950 dark:bg-purple-950/30">
                    <CardHeader className="p-4">
                      <CardTitle className="text-base text-purple-600 dark:text-purple-300">Pensions</CardTitle>
                      <CardDescription className="text-xs">
                        State pension, occupational, personal pensions
                      </CardDescription>
                    </CardHeader>
                  </Card>
                  <Card className="border border-amber-100 bg-amber-50/60 dark:border-amber-950 dark:bg-amber-950/30">
                    <CardHeader className="p-4">
                      <CardTitle className="text-base text-amber-600 dark:text-amber-300">EU & Cross-Border</CardTitle>
                      <CardDescription className="text-xs">
                        Social security coordination, EU regulations
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </div>
                <p className="max-w-md text-xs text-muted-foreground">
                  ⚠️ This is a research tool, not legal/tax advice. Always verify with qualified professionals.
                </p>
              </ChatWelcome>
            ) : (
              <>
                {messages.map((message) => (
                  <Message
                    key={message.id}
                    role={message.role}
                    content={message.content}
                  />
                ))}
                {isLoading && <MessageLoading />}
              </>
            )}
            <div ref={messagesEndRef} />
          </ChatContainer>

          <div className="border-t bg-muted/40 px-5 py-4">
            <PromptInput
              value={input}
              onChange={setInput}
              onSubmit={handleSubmit}
              placeholder="Ask about tax, welfare, pensions, or cross-border rules..."
              disabled={isLoading}
              isLoading={isLoading}
            />
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Research assistance only • Not legal, tax, or welfare advice • Verify with qualified professionals
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
