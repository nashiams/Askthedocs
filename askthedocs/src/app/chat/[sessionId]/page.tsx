"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Menu, Plus, ArrowUp, } from "lucide-react";
import { useInput } from "@/app/providers/input-context";
import Ably from "ably";
import { Sidebar } from "@/app/components/layout/sidebar";
import { AttachedDocsPanel } from "@/app/components/chat/attached-docs-panel";
import { MessageList } from "@/app/components/chat/message-list";
import { ComparisonButtons } from "@/app/components/chat/comparison-buttons";
import { AttachDocModal } from "@/app/components/chat/attach-doc-modal";
import { Toast } from "@/app/components/ui/toast";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  snippets?: any[];
  sources?: string[];
  comparisons?: string[];
  timestamp: Date;
  type?: "answer" | "comparison";
  isStreaming?: boolean;
}

interface AttachedDoc {
  url: string;
  name: string;
  status: "ready" | "indexing" | "failed";
  progress?: number;
}

export default function ChatSessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;
  const { inputValue, setInputValue, clearInput } = useInput();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [attachedDocs, setAttachedDocs] = useState<AttachedDoc[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showAttachModal, setShowAttachModal] = useState(false);
  const [showDocsPanel, setShowDocsPanel] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [availableComparisons, setAvailableComparisons] = useState<string[]>([]);
  const [showComparisons, setShowComparisons] = useState(false);
  const [toast, setToast] = useState<any>({ visible: false });
  const [ablyClient, setAblyClient] = useState<Ably.Realtime | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamingMessageRef = useRef<string>("");
  const ablyRef = useRef<Ably.Realtime | null>(null); // Added ablyRef

  // Load session data and user info on mount
  useEffect(() => {
    loadSessionData();
    getUserInfo();
  }, [sessionId]);

  // Initialize Ably ONLY after userInfo is loaded
  useEffect(() => {
    if (userInfo?.email) {
      initializeAbly(userInfo.email);
    }
  }, [userInfo]);

  // Modified line 64-71: Fix Ably cleanup to use ref and empty dependency array
  useEffect(() => {
    return () => {
      // Only cleanup if component unmounts, not on every render
      if (ablyRef.current) {
        ablyRef.current.close();
        ablyRef.current = null;
      }
    };
  }, []); // Empty dependency array - only on unmount

  const loadSessionData = async () => {
    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}`);
      if (!response.ok) throw new Error("Failed to load session");
      
      const data = await response.json();
      setMessages(data.messages.map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.timestamp)
      })));
      
      setAttachedDocs(data.session.indexedDocs.map((doc: any) => ({
        url: doc.url,
        name: doc.name,
        status: "ready",
        progress: 100
      })));
    } catch (error) {
      setToast({
        message: "Failed to load chat session",
        type: "error",
        visible: true
      });
    }
  };

  const getUserInfo = async () => {
    try {
      const response = await fetch("/api/auth/session");
      const data = await response.json();
      if (data?.user) {
        setUserInfo(data.user);
      }
    } catch (error) {
      console.error("Failed to get user info:", error);
    }
  };

  const initializeAbly = async (userEmail: string) => {
    // Guard clause to ensure we have email
    if (!userEmail) {
      console.error("Cannot initialize Ably without user email");
      return;
    }

    try {
      const tokenResponse = await fetch("/api/docs/ably-token");
      const tokenRequest = await tokenResponse.json();
      
      const ably = new Ably.Realtime({
        authCallback: (params, callback) => {
          callback(null, tokenRequest);
        }
      });
      
      setAblyClient(ably);
      ablyRef.current = ably; // Modified line 123: Store in ref as well
      
      // Subscribe to crawl updates with the correct channel name
      const channel = ably.channels.get(`crawl-${userEmail}`);
      
      channel.subscribe("progress", (message) => {
        handleCrawlProgress(message.data);
      });

      // Log successful connection
      ably.connection.on('connected', () => {
        console.log(`Ably connected for channel: crawl-${userEmail}`);
      });

      // Handle connection errors
      ably.connection.on('failed', (error) => {
        console.error('Ably connection failed:', error);
      });
    } catch (error) {
      console.error("Failed to initialize Ably:", error);
    }
  };

  const handleCrawlProgress = (data: any) => {
    if (data.status === "complete") {
      setAttachedDocs(prev => prev.map(doc => 
        doc.url === data.url 
          ? { ...doc, status: "ready", progress: 100 }
          : doc
      ));
      setToast({
        message: "Documentation ready!",
        type: "success",
        visible: true
      });
    } else if (data.status === "crawling") {
      setAttachedDocs(prev => prev.map(doc => 
        doc.url === data.url 
          ? { ...doc, progress: data.percentage || 0 }
          : doc
      ));
    } else if (data.status === "error") {
      setAttachedDocs(prev => prev.map(doc => 
        doc.url === data.url 
          ? { ...doc, status: "failed" }
          : doc
      ));
      setToast({
        message: `Failed to index ${data.url}`,
        type: "error",
        visible: true
      });
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isStreaming) return;
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue.trim(),
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setShowComparisons(false);
    clearInput();
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

  const handleAttachDoc = async (url: string) => {
    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}/attach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docUrl: url })
      });
      
      if (!response.ok) throw new Error("Failed to attach document");
      
      const data = await response.json();
      
      if (data.status === "indexing") {
        setAttachedDocs(prev => [...prev, {
          url,
          name: new URL(url).hostname,
          status: "indexing",
          progress: 0
        }]);
        setToast({
          message: "Indexing documentation...",
          type: "info",
          visible: true
        });
      } else {
        setAttachedDocs(prev => [...prev, {
          url,
          name: new URL(url).hostname,
          status: "ready",
          progress: 100
        }]);
      }
      
      setShowAttachModal(false);
    } catch (error) {
      setToast({
        message: "Failed to attach document",
        type: "error",
        visible: true
      });
    }
  };

  const handleCompare = async (technology: string) => {
    setShowComparisons(false);
    setIsStreaming(true);
    
    const lastUserMessage = messages.filter(m => m.role === "user").pop();
    
    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          technology,
          lastQuery: lastUserMessage?.content || ""
        })
      });
      
      if (!response.ok) throw new Error("Failed to compare");
      
      const data = await response.json();
      
      const comparisonMessage: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: data.comparison,
        timestamp: new Date(),
        type: "comparison"
      };
      
      setMessages(prev => [...prev, comparisonMessage]);
    } catch (error) {
      setToast({
        message: "Failed to generate comparison",
        type: "error",
        visible: true
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <div className="relative flex h-full text-white font-sans">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <Sidebar 
          isOpen={sidebarOpen} 
          onClose={() => setSidebarOpen(false)}
          userInfo={userInfo}
        />

        {/* Main Content */}
        <div className="flex-1 flex flex-col relative overflow-hidden">
          {/* Header */}
          <div 
            className="relative z-10 p-3 md:p-4 border-b flex items-center justify-between flex-shrink-0"
            style={{
              borderColor: 'rgba(255, 255, 255, 0.2)',
              background: 'rgba(26, 26, 26, 0.3)',
              backdropFilter: 'blur(10px)',
            }}
          >
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSidebarOpen(true)}
                className="md:hidden p-2 text-gray-400 hover:text-white hover:bg-white/20 rounded-lg transition-all duration-200 mr-2"
              >
                <Menu className="w-5 h-5" />
              </button>
              <span className="font-normal font-sans text-sm md:text-base">
                AskTheDocs
              </span>
            </div>
          </div>

          {/* Attached Docs Panel */}
          {showDocsPanel && (
            <AttachedDocsPanel 
              docs={attachedDocs as AttachedDoc[]}
              onClose={() => setShowDocsPanel(false)}
            />
          )}

          {/* Messages Area */}
          <div className="flex-1 relative z-10 overflow-y-auto hide-scrollbar">
            <MessageList messages={messages as Message[]} />
            
            {/* Comparison Buttons */}
            {showComparisons && availableComparisons.length > 0 && (
              <ComparisonButtons 
                technologies={availableComparisons as string[]}
                onCompare={handleCompare as (technology: string) => Promise<void>}
                disabled={isStreaming as boolean}
              />
            )}
            
            <div ref={messagesEndRef as React.RefObject<HTMLDivElement>} />
          </div>

          {/* Input Area */}
          <div className="relative z-10 p-3 md:p-6 flex-shrink-0">
            <div className="max-w-3xl mx-auto">
              <div 
                className="relative rounded-full border transition-all duration-200"
                style={{
                  background: 'rgba(26, 26, 26, 0.6)',
                  backdropFilter: 'blur(10px)',
                  borderColor: 'rgba(255, 255, 255, 0.3)',
                }}
              >
                <textarea
                  value={inputValue as string}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInputValue(e.target.value)}
                  onKeyPress={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Ask a question about your documentation..."
                  disabled={isStreaming as boolean}
                  className="w-full bg-transparent text-white placeholder-gray-400 p-4 pr-24 resize-none focus:outline-none min-h-[56px] max-h-32 text-base rounded-full"
                  rows={1}
                />
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex gap-2">
                  <button
                    onClick={() => setShowAttachModal(true)}
                    className="w-10 h-10 bg-white/10 backdrop-blur-sm text-white rounded-full hover:bg-white/20 transition-all duration-200 border border-white/30 flex items-center justify-center"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                  <button
                    onClick={handleSendMessage}
                    disabled={!inputValue.trim() || isStreaming}
                    className="w-10 h-10 bg-white/90 backdrop-blur-sm text-black rounded-full hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 border border-white/30 flex items-center justify-center"
                  >
                    <ArrowUp className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Attach Doc Modal */}
      {showAttachModal && (
        <AttachDocModal 
          onAttach={handleAttachDoc as (url: string) => Promise<void>}
          onClose={() => setShowAttachModal(false)}
        />
      )}

      {/* Toast */}
      <Toast
        message={toast.message as string}
        type={toast.type as "error" | "success" | "info" | undefined}
        isVisible={toast.visible as boolean}
        onClose={() => setToast((prev: typeof toast) => ({ ...prev, visible: false }))}
      />   
    </div>
  );
}