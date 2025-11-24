'use client';

import { useChat } from 'ai/react';

export default function Home() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({ api: '/api/chat' });

  return (
    <main className="flex min-h-screen flex-col bg-gray-900 text-white">
      <header className="border-b border-gray-800 p-6">
        <h1 className="text-2xl font-semibold">Regulatory Intelligence Copilot</h1>
        <p className="text-sm text-gray-400">
          Graph-powered research assistant for Irish tax, welfare, pensions, CGT, and EU interactions. This is research support
          only—please verify outcomes with qualified professionals.
        </p>
      </header>

      <section className="flex-1 p-6">
        <div className="space-y-4">
          {messages.map((message, index) => (
            <div key={`${message.id}-${index}`} className="rounded border border-gray-800 bg-gray-800 p-4">
              <div className="text-xs uppercase text-gray-400">{message.role === 'user' ? 'You' : 'Copilot'}</div>
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-100">{message.content}</div>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-gray-800 p-6">
        <form onSubmit={handleSubmit} className="flex items-center space-x-3">
          <textarea
            className="flex-1 rounded border border-gray-800 bg-gray-800 p-3 text-sm text-white focus:border-blue-500 focus:outline-none"
            placeholder="Ask about company tax, welfare coordination, CGT timing rules, or EU interactions..."
            value={input}
            rows={2}
            onChange={handleInputChange}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            Send
          </button>
        </form>
        <p className="mt-3 text-xs text-gray-500">
          The copilot redacts personal data before using external tools. Responses highlight uncertainty and are not legal, tax,
          or welfare advice.
        </p>
      </footer>
    </main>
  );
}
