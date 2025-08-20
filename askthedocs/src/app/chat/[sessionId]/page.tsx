"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useInput } from "@/app/providers/input-context";
import { Sidebar } from "@/app/components/layout/sidebar";
import { AttachedDocsPanel } from "@/app/components/chat/attached-docs-panel";
import { AttachDocModal } from "@/app/components/chat/attach-doc-modal";
import { Toast } from "@/app/components/ui/toast";
import { useUserInfo } from "@/app/hooks/use-user-info";
import { useToast } from "@/app/hooks/use-toast";
import { useSessionData } from "@/app/hooks/use-session-data";
import { useMessageHandling } from "@/app/hooks/use-message-handling";
import { useAblyConnection } from "@/app/hooks/use-ably-connection";
import { handleCrawlProgress } from "@/utils/crawl-progress";
import { handleAttachDoc } from "@/utils/attach-document";
import { MobileOverlay } from "@/app/components/chat/mobile-overlay";
import { ChatHeader } from "@/app/components/chat/chat-header";
import { MessagesArea } from "@/app/components/chat/message-area";
import { ChatInput } from "@/app/components/chat/chat-input";


export default function ChatSessionPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const { inputValue, setInputValue, clearInput } = useInput();
  
  // Custom hooks
  const { messages, setMessages, attachedDocs, setAttachedDocs } = useSessionData(sessionId);
  const { userInfo } = useUserInfo();
  const { toast, setToast } = useToast();
  const { 
    isStreaming, 
    availableComparisons, 
    showComparisons,  
    handleSendMessage, 
    handleCompare 
  } = useMessageHandling(sessionId, messages, setMessages, setToast);
  
  // UI State
  const [showAttachModal, setShowAttachModal] = useState(false);
  const [showDocsPanel, setShowDocsPanel] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Initialize Ably connection
  useAblyConnection(userInfo?.email || null, (data) => 
    handleCrawlProgress(data, setAttachedDocs, setToast)
  );


  const onSendMessage = async () => {
    await handleSendMessage(inputValue);
    clearInput();
  };

  const onAttachDoc = async (url: string) => {
    await handleAttachDoc(sessionId, url, setAttachedDocs, setToast, setShowAttachModal);
  };

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <div className="relative flex h-full text-white font-sans">
        {/* Mobile overlay */}
        <MobileOverlay 
          isOpen={sidebarOpen} 
          onClose={() => setSidebarOpen(false)} 
        />

        {/* Sidebar */}
        <Sidebar 
          isOpen={sidebarOpen} 
          onClose={() => setSidebarOpen(false)}
          userInfo={userInfo}
        />

        {/* Main Content */}
        <div className="flex-1 flex flex-col relative overflow-hidden">
          {/* Header */}
          <ChatHeader onMenuClick={() => setSidebarOpen(true)} />

          {/* Attached Docs Panel */}
          {showDocsPanel && (
            <AttachedDocsPanel 
              docs={attachedDocs}
              onClose={() => setShowDocsPanel(false)}
            />
          )}

          {/* Messages Area */}
          <MessagesArea 
            messages={messages}
            showComparisons={showComparisons}
            availableComparisons={availableComparisons}
            isStreaming={isStreaming}
            onCompare={handleCompare}
          />

          {/* Input Area */}
          <ChatInput
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onSend={onSendMessage}
            onAttach={() => setShowAttachModal(true)}
            disabled={isStreaming}
          />
        </div>
      </div>

      {/* Attach Doc Modal */}
      {showAttachModal && (
        <AttachDocModal 
          onAttach={onAttachDoc}
          onClose={() => setShowAttachModal(false)}
        />
      )}

      {/* Toast */}
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.visible}
        onClose={() => setToast(prev => ({ ...prev, visible: false }))}
      />   
    </div>
  );
}