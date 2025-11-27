'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useChat, type UIMessage } from '@ai-sdk/react';
import { DEFAULT_PROFILE_ID } from '@reg-copilot/reg-intel-core/client';
import {
  Bell,
  ChartBar,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Compass,
  Home,
  LucideIcon,
  Map,
  MessageSquare,
  Moon,
  Search,
  Settings,
  Sun,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

/**
 * User profile for regulatory context
 */
interface UserProfile {
  personaType: 'self-employed' | 'single-director' | 'paye-employee' | 'investor' | 'advisor';
  jurisdictions: string[];
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

function useThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    typeof document === 'undefined'
      ? 'dark'
      : document.documentElement.classList.contains('dark')
        ? 'dark'
        : 'light'
  );

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.dataset.theme = theme;
  }, [theme]);

  const toggleTheme = () => setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));

  return { theme, toggleTheme };
}

interface NavItem {
  label: string;
  icon: LucideIcon;
  href: string;
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Overview', icon: Home, href: '#' },
  { label: 'Chat', icon: MessageSquare, href: '#chat' },
  { label: 'Graph', icon: Map, href: '/graph' },
  { label: 'Insights', icon: ChartBar, href: '#insights', badge: 'New' },
  { label: 'Compliance Guides', icon: Compass, href: '#guides' },
];

export default function Home() {
  const [profile, setProfile] = useState<UserProfile>({
    personaType: DEFAULT_PROFILE_ID,
    jurisdictions: ['IE'],
  });
  const [chatMetadata, setChatMetadata] = useState<ChatMetadata | null>(null);
  const { theme, toggleTheme } = useThemeToggle();

  const { messages, status, sendMessage, setMessages } = useChat({
    api: '/api/chat',
    body: { profile },
    fetch: async (input, init) => {
      const response = await fetch(input, init);
      const clone = response.clone();

      if (clone.body) {
        // Tap the Vercel AI SSE stream for out-of-band metadata without interrupting the UI helpers
        (async () => {
          const reader = clone.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

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

              if (parsedEvent.type === 'metadata') {
                const parsedData = parseJsonSafe(parsedEvent.data);
                setChatMetadata(parsedData as ChatMetadata);
              }
            }
          }
        })();
      }

      return response;
    },
  });

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      scrollToBottom();
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length]);

  const handleSubmit = () => {
    if (!input.trim()) return;

    sendMessage({ text: input.trim(), data: { profile } });

    setInput('');
    setChatMetadata(null);
  };

  const isLoading = status === 'submitted' || status === 'streaming';

  const renderMessageText = (message: UIMessage) =>
    message.parts
      .filter(part => part.type === 'text')
      .map(part => ('text' in part ? part.text : ''))
      .join('');

  const personaLabel = useMemo(() => {
    switch (profile.personaType) {
      case 'single-director':
        return 'Single Director Company';
      case 'self-employed':
        return 'Self-Employed';
      case 'paye-employee':
        return 'PAYE Employee';
      case 'investor':
        return 'Investor (CGT)';
      case 'advisor':
        return 'Advisor';
      default:
        return 'Persona';
    }
  }, [profile.personaType]);

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="hidden lg:flex w-64 flex-col border-r bg-card/70">
        <div className="flex items-center gap-2 px-6 py-4 border-b">
          <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <CircleDot className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold">Regulatory Copilot</span>
            <span className="text-xs text-muted-foreground">Vercel AI Elements</span>
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="px-4 py-2 space-y-1">
            {NAV_ITEMS.map(item => (
              <Button
                key={item.label}
                variant="ghost"
                size="sm"
                asChild
                className="w-full justify-start gap-2"
              >
                <a href={item.href}>
                  <item.icon className="h-4 w-4" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.badge && <Badge variant="secondary" className="text-[10px]">{item.badge}</Badge>}
                </a>
              </Button>
            ))}
          </div>
          <Separator className="my-4" />
          <div className="px-4 pb-6 space-y-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Compliance Signals</CardTitle>
                <CardDescription className="text-xs">Latest cross-border watchpoints</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs">
                  <span>EU social security</span>
                  <Badge variant="secondary">Stable</Badge>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span>IE director filings</span>
                  <Badge variant="destructive" className="text-[10px]">Action</Badge>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span>UK contractor rules</span>
                  <Badge variant="secondary">Watching</Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
        <div className="px-4 py-3 border-t">
          <Button variant="outline" className="w-full justify-between" asChild>
            <a href="#graph">
              <span>Open Knowledge Graph</span>
              <ChevronRight className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col" id="chat">
        {/* Topbar */}
        <header className="border-b bg-card/70 backdrop-blur supports-[backdrop-filter]:bg-card/50">
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 gap-3">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="lg:hidden">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-lg font-semibold leading-tight">Regulatory Intelligence Copilot</h1>
                <p className="text-xs text-muted-foreground">
                  Graph-powered research with Vercel AI streaming elements
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search jurisdictions, agents, filings..."
                  className="pl-9 w-56 hidden md:block"
                />
              </div>
              <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-4 w-4" />
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-destructive" />
              </Button>
              <Button variant="outline" size="sm" className="gap-2">
                <Settings className="h-4 w-4" />
                Controls
              </Button>
              <Avatar className="h-9 w-9 border">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">RC</AvatarFallback>
              </Avatar>
            </div>
          </div>
        </header>

        <div className="flex-1 grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-4 p-4 sm:p-6">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Active Persona</CardTitle>
                  <CardDescription className="text-xs">Configured for contextual reasoning</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between text-sm">
                  <span>{personaLabel}</span>
                  <Badge variant="outline">{profile.jurisdictions.join(' • ')}</Badge>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Vercel AI</CardTitle>
                  <CardDescription className="text-xs">Streaming via SSE chat elements</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between text-sm">
                  <Badge variant="secondary">Live</Badge>
                  <Badge variant="outline">Safety guardrails</Badge>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Graph Coverage</CardTitle>
                  <CardDescription className="text-xs">Tax • Welfare • Pensions • EU</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between text-sm">
                  <span>4 domains</span>
                  <Badge variant="secondary">Cross-border</Badge>
                </CardContent>
              </Card>
            </div>

            <Card className="flex flex-col min-h-[60vh]">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Chat Workspace</CardTitle>
                  <CardDescription>Ask questions about compliance, filings, and director duties.</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <a href="/graph">View Graph</a>
                  </Button>
                  <Button size="sm" variant="default" onClick={() => setMessages([])}>
                    Reset Chat
                  </Button>
                </div>
              </CardHeader>
              <Separator />
              <ChatContainer className="flex-1">
                {messages.length === 0 ? (
                  <ChatWelcome className="py-10">
                    <div className="space-y-3">
                      <Badge variant="secondary" className="px-3 py-1">Vercel AI Elements + shadcn/ui</Badge>
                      <h2 className="text-xl font-semibold">Welcome to the Regulatory Intelligence Copilot</h2>
                      <p className="text-sm text-muted-foreground">
                        Start with a jurisdiction or scenario. The copilot blends graph lookups, timeline reasoning, and Vercel AI streaming UI.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-3xl mx-auto w-full">
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
                      <p className="text-xs text-muted-foreground max-w-2xl mx-auto">
                        ⚠️ This is a research tool, not legal/tax advice. Always verify with qualified professionals.
                      </p>
                    </div>
                  </ChatWelcome>
                ) : (
                  <>
                    {messages.map(message => (
                      <Message
                        key={message.id}
                        role={message.role}
                        content={renderMessageText(message)}
                      />
                    ))}
                    {isLoading && <MessageLoading />}
                  </>
                )}
                <div ref={messagesEndRef} />
              </ChatContainer>
              <div className="border-t bg-card p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex gap-2 items-center">
                    <label className="text-xs text-muted-foreground font-medium">Persona</label>
                    <Select
                      value={profile.personaType}
                      onValueChange={(value) =>
                        setProfile({ ...profile, personaType: value as UserProfile['personaType'] })
                      }
                    >
                      <SelectTrigger className="w-[220px] h-10 text-sm">
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
                  <div className="flex gap-2 items-center flex-wrap">
                    <label className="text-xs text-muted-foreground font-medium">Jurisdictions</label>
                    <div className="flex gap-1.5 flex-wrap">
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
                          variant={profile.jurisdictions.includes(jur) ? 'default' : 'outline'}
                          className="cursor-pointer hover:opacity-80 transition-opacity"
                        >
                          {jur}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
                <PromptInput
                  value={input}
                  onChange={setInput}
                  onSubmit={handleSubmit}
                  placeholder="Ask about tax, welfare, pensions, or cross-border rules..."
                  disabled={isLoading}
                  isLoading={isLoading}
                  className="pt-1"
                />
                <p className="text-[11px] text-muted-foreground text-center">
                  Research assistance only • Not legal, tax, or welfare advice • Verify with qualified professionals
                </p>
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Session metadata</CardTitle>
                <CardDescription>Agent provenance and uncertainty from the Vercel AI SSE stream</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {chatMetadata ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Agent</span>
                      <Badge variant="outline">{chatMetadata.agentId}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Jurisdictions</span>
                      <span className="font-medium">{chatMetadata.jurisdictions.join(', ')}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Uncertainty</span>
                      <Badge variant={chatMetadata.uncertaintyLevel === 'high' ? 'destructive' : 'secondary'}>
                        {chatMetadata.uncertaintyLevel}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Referenced Nodes</span>
                      <span className="font-medium">{chatMetadata.referencedNodes.length || 'None'}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-muted-foreground">Disclaimer</span>
                      <p className="text-xs leading-relaxed">
                        {chatMetadata.disclaimerKey} — outputs stay within egress guardrails for regulated workloads.
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No assistant response yet. Ask a question to view telemetry.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Shortcuts</CardTitle>
                <CardDescription>Kick off a new investigation in one click.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-2">
                {[
                  'Timeline for IE VAT registration on first invoice',
                  'Cross-border PRSI if director splits time with IM and IE',
                  'Company car benefit-in-kind thresholds for PAYE',
                  'Board governance duties for a single-director LTD',
                ].map(prompt => (
                  <Button
                    key={prompt}
                    variant="outline"
                    className="justify-start whitespace-normal h-auto py-3 text-left"
                    onClick={() => setInput(prompt)}
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    {prompt}
                  </Button>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
