'use client';

import { useChat } from 'ai/react';
import { useRef, useEffect, useState } from 'react';

/**
 * User profile for regulatory context
 */
interface UserProfile {
  personaType: 'self-employed' | 'single-director' | 'paye-employee' | 'investor' | 'advisor';
  jurisdictions: string[];
}

export default function Home() {
  const [profile, setProfile] = useState<UserProfile>({
    personaType: 'single-director',
    jurisdictions: ['IE'],
  });

  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
    body: { profile },
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);

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
              onChange={handleInputChange}
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
