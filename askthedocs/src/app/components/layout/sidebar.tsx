"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Edit, Search, X, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  indexedDocs: string[];
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  userInfo: {
    name?: string;
    email?: string;
    image?: string;
  } | null;
}

export function Sidebar({ isOpen, onClose, userInfo }: SidebarProps) {
  const router = useRouter();
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadChatSessions();
  }, []);

  const loadChatSessions = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/chat/sessions");
      if (response.ok) {
        const data = await response.json();
        setChatSessions(data.sessions || []);
      }
    } catch (error) {
      console.error("Failed to load chat sessions:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut({ redirect: false });
    // Clear cookies manually as backup
    document.cookie = "authjs.session-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    window.location.href = "/";
  };

  const navigateToChat = (sessionId: string) => {
    router.push(`/chat/${sessionId}`);
    onClose(); // Close sidebar on mobile after navigation
  };

  const createNewChat = () => {
    // Just close sidebar and focus input on homepage
    onClose();
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          fixed md:relative z-50 md:z-auto
          w-64 md:w-64 
          flex flex-col
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
          h-full
        `}
        style={{
          background: 'rgba(26, 26, 26, 0.4)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          borderRight: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        {/* Mobile close button */}
        <div className="md:hidden absolute top-4 right-4 z-10">
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white rounded-lg transition-all duration-200"
            style={{ background: 'rgba(255, 255, 255, 0.1)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sidebar header */}
        <div 
          className="p-4 border-b"
          style={{
            borderColor: 'rgba(255, 255, 255, 0.1)',
            background: 'rgba(255, 255, 255, 0.03)'
          }}
        >
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-white/80" />
            <span className="text-sm font-medium text-white">AskTheDocs</span>
          </div>
        </div>

        {/* Sidebar actions */}
        <div className="p-4 space-y-2">
          <button
            onClick={createNewChat}
            className="w-full flex items-center gap-3 p-2 rounded-lg text-gray-300 transition-all duration-200 hover:bg-white/10"
          >
            <Edit className="w-4 h-4" />
            <span className="text-sm">New chat</span>
          </button>
          <button
            className="w-full flex items-center gap-3 p-2 rounded-lg text-gray-300 transition-all duration-200 hover:bg-white/10"
          >
            <Search className="w-4 h-4" />
            <span className="text-sm">Search chats</span>
          </button>
        </div>

        {/* Chat history */}
        <div className="flex-1 p-4 overflow-hidden">
          <div className="text-xs text-gray-400 mb-3">Recent Chats</div>
          <div className="space-y-1 overflow-y-auto h-full pr-2 hide-scrollbar">
            {isLoading ? (
              <div className="text-sm text-gray-500 text-center py-4">
                Loading chats...
              </div>
            ) : chatSessions.length === 0 ? (
              <div className="text-sm text-gray-500 text-center py-4">
                No chats yet. Start by adding documentation!
              </div>
            ) : (
              chatSessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => navigateToChat(session.id)}
                  className="w-full text-left text-sm p-2 rounded-lg text-gray-400 hover:bg-white/5 hover:text-white transition-all duration-200 truncate"
                >
                  {session.title}
                </button>
              ))
            )}
          </div>
        </div>

        {/* User profile */}
        <div 
          className="p-4 border-t"
          style={{
            borderColor: 'rgba(255, 255, 255, 0.1)',
            background: 'rgba(255, 255, 255, 0.03)'
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {userInfo?.image ? (
                <img 
                  src={userInfo.image} 
                  alt={userInfo.name || ""} 
                  className="w-8 h-8 rounded-full"
                />
              ) : (
                <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-sm font-medium">
                  {userInfo?.name?.[0]?.toUpperCase() || "U"}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white/90 truncate">
                  {userInfo?.name || "User"}
                </div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-gray-400 hover:text-white rounded-lg transition-all duration-200 hover:bg-white/10"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}