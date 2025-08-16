"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { BookOpen, Edit, X, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { useChatSessions } from "@/app/providers/chat-sessions-context";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  userInfo: {
    name?: string;
    email?: string;
    image?: string;
  } | null;
}

interface SessionData {
  id: string;
  title?: string;
  indexedDocs?: unknown[];
  messageCount?: number;
  updatedAt: string;
}

// Generate a random color based on string (for consistent colors)
function stringToColor(str: string): string {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#FD79A8', '#A29BFE', '#6C5CE7', '#FD79A8', '#FDCB6E',
    '#6C5CE7', '#00B894', '#00CEC9', '#0984E3', '#E17055'
  ];
  
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
}

export function Sidebar({ isOpen, onClose, userInfo }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { sessions, isLoading, setRefreshNeeded } = useChatSessions();
  const [imageError, setImageError] = useState(false);

  // Get the profile color based on user's name or email
  const profileColor = useMemo(() => {
    const seed = userInfo?.name || userInfo?.email || "User";
    return stringToColor(seed);
  }, [userInfo]);

  // Get the initial letter for avatar
  const avatarLetter = useMemo(() => {
    if (userInfo?.name) {
      return userInfo.name[0].toUpperCase();
    }
    if (userInfo?.email) {
      return userInfo.email[0].toUpperCase();
    }
    return "U";
  }, [userInfo]);

  // Refresh sessions when a new chat is created
  useEffect(() => {
    // Check if we're on a chat page with a new session ID
    if (pathname.startsWith('/chat/')) {
      const currentSessionId = pathname.split('/')[2];
      const sessionExists = sessions.some(s => s.id === currentSessionId);
      
      if (currentSessionId && !sessionExists && sessions.length > 0) {
        // New session detected, refresh the list
        setRefreshNeeded(true);
      }
    }
  }, [pathname, sessions, setRefreshNeeded]);

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
    // Navigate to homepage
    router.push("/");
    onClose(); // Close sidebar on mobile
  };

  const handleImageError = () => {
    setImageError(true);
  };

  // Format session title with dynamic metadata
  const formatSessionTitle = (session: SessionData) => {
    if (session.title && session.title !== "New Chat") {
      return session.title;
    }
    
    // Generate title based on docs or message count
    if (session.indexedDocs && session.indexedDocs.length > 0) {
      const docCount = session.indexedDocs.length;
      return `Chat with ${docCount} doc${docCount > 1 ? 's' : ''}`;
    }
    
    if (session.messageCount && session.messageCount > 0) {
      return `Chat (${session.messageCount} messages)`;
    }
    
    return "New Chat";
  };

  // Get relative time
  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
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
        </div>

        {/* Chat history */}
        <div className="flex-1 p-4 overflow-hidden">
          <div className="text-xs text-gray-400 mb-3">Recent Chats</div>
          <div className="space-y-1 overflow-y-auto h-full pr-2 hide-scrollbar">
            {isLoading ? (
              <div className="text-sm text-gray-500 text-center py-4">
                Loading chats...
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-sm text-gray-500 text-center py-4">
                No chats yet. Start by adding documentation!
              </div>
            ) : (
              sessions.map((session) => {
                const isActive = pathname === `/chat/${session.id}`;
                return (
                  <button
                    key={session.id}
                    onClick={() => navigateToChat(session.id)}
                    className={`
                      w-full text-left text-sm p-2 rounded-lg 
                      transition-all duration-200 
                      ${isActive 
                        ? 'bg-white/10 text-white' 
                        : 'text-gray-400 hover:bg-white/5 hover:text-white'
                      }
                    `}
                  >
                    <div className="truncate font-medium">
                      {formatSessionTitle(session)}
                    </div>
                    <div className="text-xs opacity-60 mt-0.5">
                      {getRelativeTime(session.updatedAt)}
                    </div>
                  </button>
                );
              })
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
              {userInfo?.image && !imageError ? (
                <Image 
                  src={userInfo.image} 
                  alt={userInfo.name || "User"} 
                  width={32}
                  height={32}
                  className="rounded-full"
                  onError={handleImageError}
                />
              ) : (
                <div 
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium text-white"
                  style={{ backgroundColor: profileColor }}
                >
                  {avatarLetter}
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