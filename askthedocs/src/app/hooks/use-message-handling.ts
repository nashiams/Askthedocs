import { useState, useRef } from "react";
import { Message } from "@/types/frontend/chat";

export function useMessageHandling(
  sessionId: string,
  messages: Message[],
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
  setToast: (toast: { message: string; type: "info" | "error" | "success"; visible: boolean }) => void
) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [availableComparisons, setAvailableComparisons] = useState<string[]>([]);
  const [showComparisons, setShowComparisons] = useState(false);
  const streamingMessageRef = useRef<string>("");

  const handleSendMessage = async (inputValue: string) => {
    if (!inputValue.trim() || isStreaming) return;
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue.trim(),
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setShowComparisons(false);
    setIsStreaming(true);
    streamingMessageRef.current = "";
    
    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}/ask/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: inputValue })
      });
      
      if (!response.ok) throw new Error("Failed to send message");
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
        type: "answer",
        isStreaming: true
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'chunk') {
                streamingMessageRef.current += data.content;
                setMessages(prev => {
                  const newMessages = [...prev];
                  newMessages[newMessages.length - 1].content = streamingMessageRef.current;
                  return newMessages;
                });
              } else if (data.type === 'metadata') {
                setMessages(prev => {
                  const newMessages = [...prev];
                  newMessages[newMessages.length - 1].snippets = data.snippets;
                  newMessages[newMessages.length - 1].sources = data.sources;
                  return newMessages;
                });
              } else if (data.type === 'comparisons') {
                setAvailableComparisons(data.comparisons);
                setShowComparisons(true);
              }
            } catch (e) {
              console.error("Failed to parse SSE data:", e);
            }
          }
        }
      }
      
      setMessages(prev => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1].isStreaming = false;
        return newMessages;
      });
    } catch (error) {
      setToast({
        message: "Failed to send message",
        type: "error",
        visible: true
      });
    } finally {
      setIsStreaming(false);
      setMessages(prev => {
        const newMessages = [...prev];
        if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === 'assistant') {
          newMessages[newMessages.length - 1].isStreaming = false;
        }
        return newMessages;
      });
    }
  };

  const handleCompare = async (technology: string) => {
    setShowComparisons(false);
    setIsStreaming(true);
    streamingMessageRef.current = "";
    
    const lastUserMessage = messages.filter(m => m.role === "user").pop();
    
    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}/ask/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          technology,
          lastQuery: lastUserMessage?.content || ""
        })
      });
      
      if (!response.ok) throw new Error("Failed to compare");
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      const comparisonMessage: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
        type: "comparison",
        isStreaming: true
      };
      
      setMessages(prev => [...prev, comparisonMessage]);
      
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'chunk') {
                streamingMessageRef.current += data.content;
                setMessages(prev => {
                  const newMessages = [...prev];
                  newMessages[newMessages.length - 1].content = streamingMessageRef.current;
                  return newMessages;
                });
              } else if (data.type === 'metadata') {
                setMessages(prev => {
                  const newMessages = [...prev];
                  newMessages[newMessages.length - 1].snippets = data.snippets;
                  newMessages[newMessages.length - 1].sources = data.sources;
                  return newMessages;
                });
              }
            } catch (e) {
              console.error("Failed to parse SSE data:", e);
            }
          }
        }
      }
      
      setMessages(prev => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1].isStreaming = false;
        return newMessages;
      });
    } catch (error) {
      setToast({
        message: "Failed to generate comparison",
        type: "error",
        visible: true
      });
    } finally {
      setIsStreaming(false);
      setMessages(prev => {
        const newMessages = [...prev];
        if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === 'assistant') {
          newMessages[newMessages.length - 1].isStreaming = false;
        }
        return newMessages;
      });
    }
  };

  return {
    isStreaming,
    availableComparisons,
    showComparisons,
    setShowComparisons,
    handleSendMessage,
    handleCompare
  };
}