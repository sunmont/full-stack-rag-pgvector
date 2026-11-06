'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

type Message = {
  role: 'user' | 'assistant';
  content: string;
  retrievedContext?: string;
};

type ChatContextType = {
  messages: Message[];
  input: string;
  setInput: (val: string) => void;
  isLoading: boolean;
  sendMessage: (e: React.FormEvent) => Promise<void>;
  
  // Document Ingestion State & Methods
  ingestContent: string;
  setIngestContent: (val: string) => void;
  ingestSource: string;
  setIngestSource: (val: string) => void;
  ingestStatus: string;
  isIngesting: boolean;
  ingestDocument: (e: React.FormEvent) => Promise<void>;
};

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Ingestion States
  const [ingestContent, setIngestContent] = useState('');
  const [ingestSource, setIngestSource] = useState('');
  const [ingestStatus, setIngestStatus] = useState('');
  const [isIngesting, setIsIngesting] = useState(false);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: input };
    const updatedMessages = [...messages, userMessage];
    
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);

    setMessages((prev) => [...prev, { role: 'assistant', content: '', retrievedContext: undefined }]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages }),
      });

      if (!response.ok || !response.body) {
        throw new Error('Failed to stream response from server');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            if (dataStr === '[DONE]') break;

            try {
              const parsed = JSON.parse(dataStr);

              if (parsed.content) {
                accumulatedContent += parsed.content;
                setMessages((prev) => {
                  const newMsgs = [...prev];
                  newMsgs[newMsgs.length - 1] = {
                    ...newMsgs[newMsgs.length - 1],
                    content: accumulatedContent,
                  };
                  return newMsgs;
                });
              }

              if (parsed.type === 'metadata' && parsed.retrieved_context) {
                setMessages((prev) => {
                  const newMsgs = [...prev];
                  newMsgs[newMsgs.length - 1] = {
                    ...newMsgs[newMsgs.length - 1],
                    retrievedContext: parsed.retrieved_context,
                  };
                  return newMsgs;
                });
              }
            } catch (err) {
              // Ignore partial JSON chunks
            }
          }
        }
      }
    } catch (error) {
      console.error('Streaming error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const ingestDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ingestContent.trim() || isIngesting) return;

    setIsIngesting(true);
    setIngestStatus('');

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/api/v1/documents/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: ingestContent,
          metadata: { source: ingestSource || 'manual_input' },
          chunk_size: 500,
          chunk_overlap: 50
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Ingestion failed');

      setIngestStatus(`✅ Success! ${data.message}`);
      setIngestContent('');
      setIngestSource('');
    } catch (err: any) {
      setIngestStatus(`❌ Error: ${err.message}`);
    } finally {
      setIsIngesting(false);
    }
  };

  return (
    <ChatContext.Provider 
      value={{ 
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
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}