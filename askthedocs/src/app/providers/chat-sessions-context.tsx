"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  indexedDocs: string[];
}

interface ChatSessionsContextType {
  sessions: ChatSession[];
  isLoading: boolean;
  loadSessions: () => Promise<void>;
  addSession: (session: ChatSession) => void;
  updateSession: (sessionId: string, updates: Partial<ChatSession>) => void;
  deleteSession: (sessionId: string) => void;
  refreshNeeded: boolean;
  setRefreshNeeded: (value: boolean) => void;
}

const ChatSessionsContext = createContext<ChatSessionsContextType | undefined>(undefined);

export function ChatSessionsProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshNeeded, setRefreshNeeded] = useState(false);
  const [hasInitialLoad, setHasInitialLoad] = useState(false);

  // Load sessions only when needed
  const loadSessions = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/chat/sessions");
      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions || []);
        setHasInitialLoad(true);
        setRefreshNeeded(false);
      }
    } catch (error) {
      console.error("Failed to load chat sessions:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    if (!hasInitialLoad) {
      loadSessions();
    }
  }, []);

  // Reload when refresh is needed
  useEffect(() => {
    if (refreshNeeded && hasInitialLoad) {
      loadSessions();
    }
  }, [refreshNeeded]);

  // Add a new session
  const addSession = (session: ChatSession) => {
    setSessions(prev => [session, ...prev]);
  };

  // Update an existing session
  const updateSession = (sessionId: string, updates: Partial<ChatSession>) => {
    setSessions(prev => prev.map(session => 
      session.id === sessionId 
        ? { ...session, ...updates }
        : session
    ));
  };

  // Delete a session
  const deleteSession = (sessionId: string) => {
    setSessions(prev => prev.filter(session => session.id !== sessionId));
  };

  return (
    <ChatSessionsContext.Provider value={{
      sessions,
      isLoading,
      loadSessions,
      addSession,
      updateSession,
      deleteSession,
      refreshNeeded,
      setRefreshNeeded
    }}>
      {children}
    </ChatSessionsContext.Provider>
  );
}

export function useChatSessions() {
  const context = useContext(ChatSessionsContext);
  if (context === undefined) {
    throw new Error("useChatSessions must be used within a ChatSessionsProvider");
  }
  return context;
}