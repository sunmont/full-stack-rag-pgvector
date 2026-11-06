'use client';

import { useEffect, useRef, useState } from 'react';
import { ChatProvider, useChat } from '@/context/ChatContext';

function ChatInterface() {
  const { 
    messages, 
    input, 
    setInput, 
    isLoading, 
    sendMessage,
    ingestContent,
    setIngestContent,
    ingestSource,
    setIngestSource,
    ingestStatus,
    isIngesting,
    ingestDocument
  } = useChat();
  
  const [activeTab, setActiveTab] = useState<'chat' | 'ingest'>('chat');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (activeTab === 'chat') {
      scrollToBottom();
    }
  }, [messages, activeTab]);

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto p-4 justify-between bg-gray-950 text-white">
      {/* Top Navigation Tabs */}
      <div className="flex border-b border-gray-800 mb-4 pb-2 gap-4">
        <button
          onClick={() => setActiveTab('chat')}
          className={`pb-2 font-medium text-sm transition-colors ${activeTab === 'chat' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-white'}`}
        >
          💬 Chat Assistant
        </button>
        <button
          onClick={() => setActiveTab('ingest')}
          className={`pb-2 font-medium text-sm transition-colors ${activeTab === 'ingest' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-white'}`}
        >
          📂 Document Ingestion
        </button>
      </div>

      {activeTab === 'chat' ? (
        <>
          {/* Scrollable message container */}
          <div className="overflow-y-auto space-y-4 mb-4 flex-1 pr-2">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 my-auto py-20">
                <p className="text-lg font-medium">No messages yet.</p>
                <p className="text-sm">Ask a question or ingest some documents to get started!</p>
              </div>
            )}
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-xl ${
                  msg.role === 'user' ? 'bg-blue-600 ml-auto max-w-[80%]' : 'bg-gray-900 border border-gray-800 mr-auto max-w-[80%]'
                }`}
              >
                {msg.retrievedContext && (
                  <details className="mb-3 bg-gray-950 border border-gray-700 rounded p-2 text-xs text-gray-300">
                    <summary className="cursor-pointer font-semibold text-blue-400 hover:text-blue-300">
                      🔍 Retrieved RAG Context (pgvector)
                    </summary>
                    <p className="mt-2 whitespace-pre-wrap text-gray-400 border-t border-gray-800 pt-2">
                      {msg.retrievedContext}
                    </p>
                  </details>
                )}
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            ))}
            
            {isLoading && messages[messages.length - 1]?.content === '' && (
              <div className="text-gray-400 text-sm animate-pulse">AI is thinking...</div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={sendMessage} className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask your RAG assistant..."
              className="flex-1 p-3 rounded-lg bg-gray-900 border border-gray-700 text-white focus:outline-none focus:border-blue-500"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading}
              className="bg-blue-600 px-5 py-3 rounded-lg hover:bg-blue-500 disabled:opacity-50 font-medium"
            >
              Send
            </button>
          </form>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-xl font-bold mb-2">Ingest New Document</h2>
          <p className="text-sm text-gray-400 mb-6">
            Paste text or documentation below to automatically chunk, embed, and store it in PostgreSQL.
          </p>

          <form onSubmit={ingestDocument} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Source Identifier</label>
              <input
                type="text"
                value={ingestSource}
                onChange={(e) => setIngestSource(e.target.value)}
                placeholder="e.g., enterprise_architecture.md"
                className="w-full p-3 rounded-lg bg-gray-950 border border-gray-700 text-white focus:outline-none focus:border-blue-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Document Content</label>
              <textarea
                rows={12}
                value={ingestContent}
                onChange={(e) => setIngestContent(e.target.value)}
                placeholder="Paste reference text here..."
                className="w-full p-3 rounded-lg bg-gray-950 border border-gray-700 text-white focus:outline-none focus:border-blue-500 text-sm font-mono"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isIngesting || !ingestContent.trim()}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 py-3 rounded-lg font-medium transition-colors"
            >
              {isIngesting ? 'Chunking & Ingesting...' : 'Ingest Document'}
            </button>
          </form>

          {ingestStatus && (
            <div className={`mt-4 p-3 rounded-lg text-sm font-medium ${ingestStatus.includes('✅') ? 'bg-green-950 border border-green-800 text-green-300' : 'bg-red-950 border border-red-800 text-red-300'}`}>
              {ingestStatus}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <ChatProvider>
      <ChatInterface />
    </ChatProvider>
  );
}