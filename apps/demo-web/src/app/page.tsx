'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

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
    personaType: 'single-director',
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
    <main className="flex min-h-screen flex-col bg-gray-900 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 p-4">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Regulatory Intelligence Copilot 🧭</h1>
            <p className="text-sm text-gray-400">
              Graph-powered regulatory research for tax, welfare, pensions, and EU rules
            </p>
          </div>
          <a
            href="/graph"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors"
          >
            View Graph
          </a>
        </div>
      </header>

      <div className="flex-1 flex flex-col max-w-5xl w-full mx-auto">
        {/* Profile Selector */}
        <div className="border-b border-gray-800 p-4 flex gap-4 items-center">
          <div className="flex gap-2 items-center">
            <label className="text-sm text-gray-400">Persona:</label>
            <select
              value={profile.personaType}
              onChange={(e) => setProfile({ ...profile, personaType: e.target.value as UserProfile['personaType'] })}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-1 text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="single-director">Single Director Company (IE)</option>
              <option value="self-employed">Self-Employed</option>
              <option value="paye-employee">PAYE Employee</option>
              <option value="investor">Investor (CGT)</option>
              <option value="advisor">Tax/Welfare Advisor</option>
            </select>
          </div>

          <div className="flex gap-2 items-center">
            <label className="text-sm text-gray-400">Jurisdictions:</label>
            <div className="flex gap-1">
              {['IE', 'EU', 'MT', 'IM'].map((jur) => (
                <button
                  key={jur}
                  onClick={() => {
                    const current = profile.jurisdictions;
                    if (current.includes(jur)) {
                      setProfile({ ...profile, jurisdictions: current.filter(j => j !== jur) });
                    } else {
                      setProfile({ ...profile, jurisdictions: [...current, jur] });
                    }
                  }}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    profile.jurisdictions.includes(jur)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {jur}
                </button>
              ))}
            </div>
          </div>
        </div>

        {chatMetadata && (
          <div className="border-b border-gray-800 px-4 py-3 text-sm text-gray-300 bg-gray-950/50">
            <div className="flex flex-wrap gap-4">
              <div>
                <span className="text-gray-500">Agent:</span> {chatMetadata.agentId}
              </div>
              <div>
                <span className="text-gray-500">Jurisdictions:</span> {chatMetadata.jurisdictions.join(', ')}
              </div>
              <div>
                <span className="text-gray-500">Uncertainty:</span> {chatMetadata.uncertaintyLevel}
              </div>
              <div>
                <span className="text-gray-500">Disclaimer:</span> {chatMetadata.disclaimerKey}
              </div>
              <div>
                <span className="text-gray-500">Referenced Nodes:</span>{' '}
                {chatMetadata.referencedNodes.length > 0 ? chatMetadata.referencedNodes.join(', ') : 'none'}
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-400 mt-8 space-y-4">
              <p className="text-lg">Welcome to the Regulatory Intelligence Copilot!</p>
              <p className="text-sm">Ask questions about:</p>
              <div className="grid grid-cols-2 gap-2 max-w-2xl mx-auto text-left">
                <div className="p-3 bg-gray-800 rounded">
                  <p className="font-semibold text-blue-400">Tax & Company Law</p>
                  <p className="text-xs text-gray-500">Corporation tax, CGT, R&D credits, director obligations</p>
                </div>
                <div className="p-3 bg-gray-800 rounded">
                  <p className="font-semibold text-green-400">Social Welfare</p>
                  <p className="text-xs text-gray-500">PRSI, benefits, entitlements, contributions</p>
                </div>
                <div className="p-3 bg-gray-800 rounded">
                  <p className="font-semibold text-purple-400">Pensions</p>
                  <p className="text-xs text-gray-500">State pension, occupational, personal pensions</p>
                </div>
                <div className="p-3 bg-gray-800 rounded">
                  <p className="font-semibold text-yellow-400">EU & Cross-Border</p>
                  <p className="text-xs text-gray-500">Social security coordination, EU regulations</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-6">
                ⚠️ This is a research tool, not legal/tax advice. Always verify with qualified professionals.
              </p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-[85%] rounded-lg p-4 ${
                  message.role === 'user'
                    ? 'bg-blue-600'
                    : 'bg-gray-800 border border-gray-700'
                }`}
              >
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                  {message.content}
                </pre>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="flex space-x-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-800 p-4">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about tax, welfare, pensions, or cross-border rules..."
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed px-6 py-3 rounded-lg transition-colors font-medium"
            >
              {isLoading ? 'Thinking...' : 'Send'}
            </button>
          </form>
          <p className="text-xs text-gray-500 mt-2 text-center">
            Research assistance only • Not legal, tax, or welfare advice • Verify with qualified professionals
          </p>
        </div>
      </div>
    </main>
  );
}
