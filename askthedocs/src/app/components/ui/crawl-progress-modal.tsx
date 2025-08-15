"use client";

import { useState } from "react";
import { Loader2, CheckCircle, X, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";

interface CrawlProgressModalProps {
  isVisible: boolean;
  onClose: () => void;
  url?: string;
  sessionId?: string;
  status: "idle" | "crawling" | "complete" | "error";
  progress?: number;
  message?: string;
}

export function CrawlProgressModal({ 
  isVisible, 
  onClose, 
  url, 
  sessionId,
  status,
  progress = 0,
  message
}: CrawlProgressModalProps) {
  const router = useRouter();
  const [isMinimized, setIsMinimized] = useState(false);

  if (!isVisible) return null;

  const handleNavigateToChat = () => {
    if (sessionId) {
      router.push(`/chat/${sessionId}`);
      onClose();
    }
  };

  // Minimized view - shows in bottom right corner
  if (isMinimized) {
    return (
      <div 
        className="fixed bottom-4 right-4 z-50 p-3 rounded-lg cursor-pointer"
        style={{
          background: 'rgba(26, 26, 26, 0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          minWidth: '200px'
        }}
        onClick={() => setIsMinimized(false)}
      >
        <div className="flex items-center gap-2">
          {status === "crawling" && <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />}
          {status === "complete" && <CheckCircle className="w-4 h-4 text-green-400" />}
          <span className="text-xs text-white">
            {status === "crawling" ? `Indexing... ${progress}%` : "Indexing complete!"}
          </span>
        </div>
      </div>
    );
  }

  // Full modal view
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div 
        className="relative z-10 w-full max-w-md mx-4 p-6 rounded-2xl pointer-events-auto"
        style={{
          background: 'rgba(26, 26, 26, 0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-light text-white">
            {status === "complete" ? "Documentation Ready!" : "Indexing Documentation"}
          </h3>
          <button
            onClick={() => setIsMinimized(true)}
            className="p-1 text-gray-400 hover:text-white rounded transition-all"
            title="Minimize"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {url && (
          <div className="mb-4 p-2 rounded" style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
            <p className="text-xs text-gray-400 truncate">{url}</p>
          </div>
        )}

        {status === "crawling" && (
          <>
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-300">Progress</span>
                <span className="text-sm text-blue-400">{progress}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div 
                  className="bg-blue-400 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            {message && (
              <p className="text-sm text-gray-400 mb-4">{message}</p>
            )}
            <p className="text-xs text-gray-500">
              You can browse other chats while waiting...
            </p>
          </>
        )}

        {status === "complete" && (
          <>
            <div className="flex items-center gap-2 mb-4 text-green-400">
              <CheckCircle className="w-5 h-5" />
              <span className="text-sm">Documentation indexed successfully!</span>
            </div>
            {sessionId && (
              <button
                onClick={handleNavigateToChat}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-lg transition-all duration-200"
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                }}
              >
                <span className="text-white">Go to Chat</span>
                <ArrowRight className="w-4 h-4 text-white" />
              </button>
            )}
          </>
        )}

        {status === "error" && (
          <div className="text-red-400 text-sm">
            Failed to index documentation. Please try again.
          </div>
        )}
      </div>
    </div>
  );
}