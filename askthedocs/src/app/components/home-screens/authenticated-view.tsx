import { Menu } from "lucide-react";
import { DocInput } from "../chat/doc-input";
import { Sidebar } from "../layout/sidebar";
import { CrawlProgressModal } from "../ui/crawl-progress-modal";
import { Toast } from "../ui/toast";
import { CrawlStatus, ToastState, UserInfo } from "@/types/frontend/home";
import { ChatHeader } from "../layout/chat-header";
import { DocumentationInput } from "../sections/docs-input";

interface AuthenticatedViewProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  userInfo: UserInfo | null;
  handleSubmit: () => Promise<void>;
  isSubmitting: boolean;
  isCrawling: boolean;
  crawlStatus: CrawlStatus;
  setCrawlStatus: (status: CrawlStatus | ((prev: CrawlStatus) => CrawlStatus)) => void;
  toast: ToastState;
  setToast: (toast: ToastState) => void;
}

export function AuthenticatedView({
  sidebarOpen,
  setSidebarOpen,
  userInfo,
  handleSubmit,
  isSubmitting,
  isCrawling,
  crawlStatus,
  setCrawlStatus,
  toast,
  setToast
}: AuthenticatedViewProps) {
  return (
    <div className="relative w-full h-screen overflow-hidden">
      <div
        className="absolute inset-0 gradient-bg fade-gradient"
        style={{
          opacity: 1,
          transition: "opacity 0.8s ease-in-out",
          zIndex: 0
        }}
      />
      
      <div className="relative flex h-full text-white font-sans z-10">
        <Sidebar 
          isOpen={sidebarOpen} 
          onClose={() => setSidebarOpen(false)}
          userInfo={userInfo}
        />

        <div className="flex-1 flex flex-col relative overflow-hidden">
          <ChatHeader onMenuClick={() => setSidebarOpen(true)} />
          <DocumentationInput 
            handleSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            isCrawling={isCrawling}
          />
        </div>
      </div>

      <CrawlProgressModal 
        isVisible={crawlStatus.isVisible}
        onClose={() => setCrawlStatus(prev => ({ ...prev, isVisible: false }))}
        url={crawlStatus.url}
        sessionId={crawlStatus.sessionId}
        status={crawlStatus.status}
        progress={crawlStatus.progress}
        message={crawlStatus.message}
      />

      <Toast
        message={toast.message ?? ""}
        type={toast.type}
        isVisible={toast.visible}
        onClose={() => setToast({ ...toast, visible: false })}
      />
    </div>
  );
}