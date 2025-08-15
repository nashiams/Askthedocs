"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Menu } from "lucide-react";
import { useInput } from "@/app/providers/input-context";
import { checkAuth } from "@/lib/auth/check-auth";
import Ably from "ably";
import { DocInput } from "./components/chat/doc-input";
import { AuthModal } from "./components/auth/auth-modal";
import { Toast } from "./components/ui/toast";
import { Sidebar } from "./components/layout/sidebar";
import { CrawlProgressModal } from "./components/ui/crawl-progress-modal";

type ToastState = {
  message?: string;
  type?: "error" | "info" | "success";
  visible: boolean;
};

export default function HomePage() {
  const router = useRouter();
  const { inputValue, clearInput } = useInput();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showGradient, setShowGradient] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [crawlStatus, setCrawlStatus] = useState<{
    isVisible: boolean;
    status: "idle" | "crawling" | "complete" | "error";
    progress: number;
    message: string;
    url?: string;
    sessionId?: string;
  }>({
    isVisible: false,
    status: "idle",
    progress: 0,
    message: ""
  });
  const [isCrawling, setIsCrawling] = useState(false);
  const [toast, setToast] = useState<ToastState>({ visible: false });
  const ablyRef = useRef<Ably.Realtime | null>(null);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Initialize Ably only after we have userInfo
  useEffect(() => {
    if (userInfo?.email && !ablyRef.current) {
      initializeAbly(userInfo.email);
    }
  }, [userInfo]);

  const checkAuthStatus = async () => {
    setIsCheckingAuth(true);
    
    try {
      const isLoggedIn = await checkAuth();
      
      if (isLoggedIn) {
        const response = await fetch("/api/auth/session");
        const data = await response.json();
        
        if (data?.user) {
          setIsAuthenticated(true);
          setUserInfo(data.user);
          // Don't initialize Ably here - wait for useEffect
        } else {
          setIsAuthenticated(false);
        }
      } else {
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error("Auth check failed:", error);
      setIsAuthenticated(false);
    }
    
    setIsCheckingAuth(false);
  };

  const initializeAbly = async (userEmail: string) => {
    if (!userEmail || ablyRef.current) return;
    
    try {
      console.log("Initializing Ably for:", userEmail);
      
      const tokenResponse = await fetch("/api/docs/ably-token");
      const tokenRequest = await tokenResponse.json();
      
      const ably = new Ably.Realtime({
        authCallback: (params, callback) => {
          callback(null, tokenRequest);
        }
      });
      
      ablyRef.current = ably;
      const channel = ably.channels.get(`crawl-${userEmail}`);
      
      // Modified section: Update Ably handler to navigate when complete (lines 91-123)
      channel.subscribe("progress", (message) => {
        const data = message.data;
        console.log("Ably progress update:", data);
        
        if (data.status === "crawling" || data.status === "embedding") {
          setCrawlStatus(prev => ({
            ...prev,
            status: "crawling",
            progress: data.percentage || prev.progress,
            message: data.message || "Processing documentation..."
          }));
        } else if (data.status === "complete" && data.sessionId) {
          setCrawlStatus(prev => ({
            ...prev,
            status: "complete",
            progress: 100,
            message: "Documentation ready!"
          }));
          setIsCrawling(false);
          
          // Navigate to chat
          setTimeout(() => {
            router.push(`/chat/${data.sessionId}`);
          }, 1000);
        } else if (data.status === "error") {
          setCrawlStatus(prev => ({
            ...prev,
            status: "error",
            message: data.message || "Failed to index documentation"
          }));
          setIsCrawling(false);
        }
      });
      
      ably.connection.on('connected', () => {
        console.log('Ably connected successfully');
      });
      
      ably.connection.on('failed', (error) => {
        console.error('Ably connection failed:', error);
      });
      
    } catch (error) {
      console.error("Failed to initialize Ably:", error);
    }
  };

  const isValidUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === "https:" || urlObj.protocol === "http:";
    } catch {
      return false;
    }
  };

  const handleSubmit = async () => {
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }

    if (!isValidUrl(inputValue)) {
      setToast({
        message: "Please enter a valid documentation URL",
        type: "error",
        visible: true,
      });
      return;
    }

    if (isCrawling) {
      setToast({
        message: "Already indexing documentation. Please wait...",
        type: "info",
        visible: true,
      });
      return;
    }

    setIsSubmitting(true);
    setIsCrawling(true);
    
    try {
      // REPLACED SECTION: First create session (lines 170-177)
      const sessionRes = await fetch("/api/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ indexedDocs: [] }),
      });
      
      const { sessionId } = await sessionRes.json();
      
      // REPLACED SECTION: Then check if doc exists/start crawling with sessionId (lines 179-187)
      const crawlRes = await fetch("/api/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          url: inputValue,
          sessionId // Pass sessionId
        }),
      });

      const crawlData = await crawlRes.json();
      
      // REPLACED SECTION: Handle response based on crawlData status (lines 191-209)
      if (crawlData.status === "ready" || crawlData.fromCache) {
        // Already indexed, navigate immediately
        clearInput();
        router.push(`/chat/${sessionId}`);
      } else {
        // Show progress modal
        setCrawlStatus({
          isVisible: true,
          status: "crawling",
          progress: 0,
          message: "Starting to index documentation...",
          url: inputValue,
          sessionId
        });
        clearInput();
      }
      
    } catch (error) {
      setToast({
        message: error instanceof Error ? error.message : "Failed to process documentation URL",
        type: "error",
        visible: true,
      });
      setIsCrawling(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Cleanup Ably on unmount
  useEffect(() => {
    return () => {
      if (ablyRef.current) {
        ablyRef.current.close();
        ablyRef.current = null;
      }
    };
  }, []);

  if (isCheckingAuth) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-black">
        <div className="text-white">Checking authentication...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="relative w-full h-screen overflow-hidden">
        <div className="absolute inset-0 gradient-bg fade-gradient" style={{ zIndex: 0 }} />
        
        <div className="relative flex h-full text-white font-sans z-10">
          <div className="flex-1 flex flex-col relative overflow-hidden">
            <div 
              className="relative z-10 p-3 md:p-4 border-b flex items-center justify-center flex-shrink-0"
              style={{
                borderColor: 'rgba(255, 255, 255, 0.2)',
                background: 'rgba(26, 26, 26, 0.3)',
                backdropFilter: 'blur(10px)',
              }}
            >
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-white/80" />
                <span className="font-normal font-sans text-sm md:text-base">
                  AskTheDocs
                </span>
              </div>
            </div>

            <div className="flex-1 relative z-10 flex flex-col items-center justify-center px-4 md:px-8">
              <div className="text-center max-w-2xl mb-8">
                <h1 className="text-2xl md:text-4xl font-light mb-4 font-sans">
                  AI That Actually Reads the Docs
                </h1>
                <p className="text-gray-300 text-base md:text-lg leading-relaxed font-light font-sans">
                  AskTheDocs lets you crawl your documentation in real-time and get clear, accurate answers without hallucination.
                </p>
              </div>
              
              <div className="w-full max-w-3xl" onClick={() => setShowAuthModal(true)}>
                <DocInput 
                  onSubmit={() => setShowAuthModal(true)}
                  disabled={false}
                  placeholder="Insert the Docs link (e.g. https://sequelize.org/docs/v7)"
                />
              </div>
            </div>
          </div>
        </div>

        <AuthModal 
          isOpen={showAuthModal} 
          onClose={() => {
            setShowAuthModal(false);
            setTimeout(() => {
              checkAuthStatus(); // Re-check auth instead of reload
            }, 500);
          }} 
        />

        <Toast
          message={toast.message ?? ""}
          type={toast.type}
          isVisible={toast.visible}
          onClose={() => setToast(prev => ({ ...prev, visible: false }))}
        />
      </div>
    );
  }

  // Logged in view
  return (
    <div className="relative w-full h-screen overflow-hidden">
      {showGradient && (
        <div
          className="absolute inset-0 gradient-bg fade-gradient"
          style={{
            opacity: showGradient ? 1 : 0,
            transition: "opacity 0.8s ease-in-out",
            zIndex: 0
          }}
        />
      )}
      
      <div className="relative flex h-full text-white font-sans z-10">
        <Sidebar 
          isOpen={sidebarOpen} 
          onClose={() => setSidebarOpen(false)}
          userInfo={userInfo}
        />

        <div className="flex-1 flex flex-col relative overflow-hidden">
          <div 
            className="relative z-10 p-3 md:p-4 border-b flex items-center flex-shrink-0"
            style={{
              borderColor: 'rgba(255, 255, 255, 0.2)',
              background: 'rgba(26, 26, 26, 0.3)',
              backdropFilter: 'blur(10px)',
            }}
          >
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-2 text-gray-400 hover:text-white hover:bg-white/20 rounded-lg transition-all duration-200 mr-2"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="font-normal font-sans text-sm md:text-base">
              New Chat
            </span>
          </div>

          <div className="flex-1 relative z-10 flex flex-col items-center justify-center px-4 md:px-8">
            <div className="text-center max-w-2xl mb-8">
              <h1 className="text-2xl md:text-4xl font-light mb-4 font-sans">
                Start with Documentation
              </h1>
              <p className="text-gray-300 text-base md:text-lg leading-relaxed font-light font-sans">
                Enter a documentation URL to begin asking questions
              </p>
            </div>
            
            <div className="w-full max-w-3xl">
              <DocInput 
                onSubmit={handleSubmit}
                disabled={isSubmitting || isCrawling}
                placeholder={
                  isCrawling 
                    ? "Indexing documentation..." 
                    : isSubmitting
                    ? "Processing..." 
                    : "Insert the Docs link (e.g. https://sequelize.org/docs/v7)"
                }
              />
            </div>
          </div>
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