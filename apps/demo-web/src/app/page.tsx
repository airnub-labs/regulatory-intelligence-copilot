'use client';

import { useEffect, useRef, useState } from 'react';
import { DEFAULT_PROFILE_ID } from '@reg-copilot/reg-intel-core/client';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Message, MessageLoading } from '@/components/chat/message';
import { ChatContainer, ChatWelcome } from '@/components/chat/chat-container';
import { PromptInput } from '@/components/chat/prompt-input';
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
    <main className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b bg-card p-4">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Regulatory Intelligence Copilot 🧭</h1>
            <p className="text-sm text-muted-foreground">
              Graph-powered regulatory research for tax, welfare, pensions, and EU rules
            </p>
          </div>
          <Button asChild>
            <a href="/graph">View Graph</a>
          </Button>
        </div>
      </header>

      <div className="flex-1 flex flex-col max-w-5xl w-full mx-auto">
        {/* Profile Selector */}
        <div className="border-b bg-card p-4 flex flex-wrap gap-4 items-center">
          <div className="flex gap-2 items-center">
            <label className="text-sm text-muted-foreground font-medium">Persona:</label>
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

          <Separator orientation="vertical" className="h-6" />

          <div className="flex gap-2 items-center">
            <label className="text-sm text-muted-foreground font-medium">Jurisdictions:</label>
            <div className="flex gap-1.5">
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
                  className="cursor-pointer hover:opacity-80 transition-opacity"
                >
                  {jur}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        {chatMetadata && (
          <div className="border-b bg-muted/50 px-4 py-3 text-sm">
            <div className="flex flex-wrap gap-4 items-center">
              <div>
                <span className="text-muted-foreground font-medium">Agent:</span>{' '}
                <span className="text-foreground">{chatMetadata.agentId}</span>
              </div>
              <Separator orientation="vertical" className="h-4" />
              <div>
                <span className="text-muted-foreground font-medium">Jurisdictions:</span>{' '}
                <span className="text-foreground">{chatMetadata.jurisdictions.join(', ')}</span>
              </div>
              <Separator orientation="vertical" className="h-4" />
              <div>
                <span className="text-muted-foreground font-medium">Uncertainty:</span>{' '}
                <Badge variant={chatMetadata.uncertaintyLevel === 'high' ? 'destructive' : 'secondary'} className="ml-1">
                  {chatMetadata.uncertaintyLevel}
                </Badge>
              </div>
              <Separator orientation="vertical" className="h-4" />
              <div>
                <span className="text-muted-foreground font-medium">Referenced Nodes:</span>{' '}
                <span className="text-foreground">
                  {chatMetadata.referencedNodes.length > 0 ? chatMetadata.referencedNodes.length : 'none'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        <ChatContainer className="flex-1">
          {messages.length === 0 ? (
            <ChatWelcome>
              <h2 className="text-xl font-semibold">Welcome to the Regulatory Intelligence Copilot!</h2>
              <p className="text-sm text-muted-foreground">Ask questions about:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto w-full">
                <Card>
                  <CardHeader className="p-4">
                    <CardTitle className="text-base text-blue-500">Tax & Company Law</CardTitle>
                    <CardDescription className="text-xs">
                      Corporation tax, CGT, R&D credits, director obligations
                    </CardDescription>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="p-4">
                    <CardTitle className="text-base text-green-500">Social Welfare</CardTitle>
                    <CardDescription className="text-xs">
                      PRSI, benefits, entitlements, contributions
                    </CardDescription>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="p-4">
                    <CardTitle className="text-base text-purple-500">Pensions</CardTitle>
                    <CardDescription className="text-xs">
                      State pension, occupational, personal pensions
                    </CardDescription>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="p-4">
                    <CardTitle className="text-base text-yellow-500">EU & Cross-Border</CardTitle>
                    <CardDescription className="text-xs">
                      Social security coordination, EU regulations
                    </CardDescription>
                  </CardHeader>
                </Card>
              </div>
              <p className="text-xs text-muted-foreground max-w-md">
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

        {/* Input */}
        <div className="border-t bg-card p-4">
          <PromptInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            placeholder="Ask about tax, welfare, pensions, or cross-border rules..."
            disabled={isLoading}
            isLoading={isLoading}
          />
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Research assistance only • Not legal, tax, or welfare advice • Verify with qualified professionals
          </p>
        </div>
      </div>
    </main>
  );
}
