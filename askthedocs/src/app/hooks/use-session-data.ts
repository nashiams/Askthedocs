import { useState, useCallback, useEffect } from "react";
import { Message, AttachedDoc, SessionData } from "@/types/frontend/chat";

export function useSessionData(sessionId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [attachedDocs, setAttachedDocs] = useState<AttachedDoc[]>([]);

  const loadSessionData = useCallback(async () => {
    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}`);
      if (!response.ok) throw new Error("Failed to load session");
      
      const data: SessionData = await response.json();
      setMessages(data.messages.map((msg) => ({
        ...msg,
        timestamp: new Date(msg.timestamp),
        snippets: msg.snippets ? (msg.snippets as string[]) : undefined
      })));
      
      setAttachedDocs(data.session.indexedDocs.map((doc) => ({
        url: doc.url,
        name: doc.name,
        status: "ready" as const,
        progress: 100
      })));
    } catch (error) {
      throw error; // Let parent component handle the error
    }
  }, [sessionId]);

  useEffect(() => {
    loadSessionData().catch(() => {
      // Error will be handled by parent
    });
  }, [loadSessionData]);

  return {
    messages,
    setMessages,
    attachedDocs,
    setAttachedDocs,
    reloadSession: loadSessionData
  };
}