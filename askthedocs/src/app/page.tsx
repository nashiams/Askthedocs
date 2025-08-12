"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Menu } from "lucide-react";

import { useInput } from "@/app/providers/input-context";
import { checkAuthCookie } from "@/lib/auth/check-auth";
import { DocInput } from "./components/chat/doc-input";
import { AuthModal } from "./components/auth/auth-modal";
import { Toast } from "./components/ui/toast";
import { Sidebar } from "./components/layout/sidebar";

export default function HomePage() {
  const router = useRouter();
  const { inputValue, clearInput } = useInput();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showGradient, setShowGradient] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userInfo, setUserInfo] = useState<{ name?: string; email?: string; image?: string } | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
    visible: boolean;
  }>({ message: "", type: "info", visible: false });

  // Check auth on mount with detailed debugging
  useEffect(() => {
    const checkAuth = async () => {
      console.log("🔍 Starting auth check...");
      setIsCheckingAuth(true);
      
      // Step 1: Check cookies on client side
      const hasCookie = checkAuthCookie();
      console.log("Step 1 - Cookie check result:", hasCookie);
      
      // Step 2: Check with debug endpoint
      try {
        const debugResponse = await fetch("/api/auth/check");
        const debugData = await debugResponse.json();
        console.log("Step 2 - Debug endpoint response:", debugData);
      } catch (error) {
        console.error("Debug endpoint error:", error);
      }
      
      // Step 3: Check session endpoint
      try {
        const sessionResponse = await fetch("/api/auth/session");
        const sessionData = await sessionResponse.json();
        console.log("Step 3 - Session data:", sessionData);
        
        if (sessionData?.user) {
          console.log("✅ User is authenticated:", sessionData.user);
          setIsAuthenticated(true);
          setUserInfo(sessionData.user);
        } else {
          console.log("❌ No user in session data");
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.error("❌ Session check failed:", error);
        setIsAuthenticated(false);
      }
      
      setIsCheckingAuth(false);
      console.log("🏁 Auth check complete. Authenticated:", isAuthenticated);
    };

    checkAuth();
  }, []);

  // Debug: Log state changes
  useEffect(() => {
    console.log("📊 State updated:", {
      isAuthenticated,
      isCheckingAuth,
      userInfo
    });
  }, [isAuthenticated, isCheckingAuth, userInfo]);

  const isValidUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === "https:" || urlObj.protocol === "http:";
    } catch {
      return false;
    }
  };

  const handleSubmit = async () => {
    console.log("📤 Submitting with auth state:", isAuthenticated);
    
    if (!isAuthenticated) {
      console.log("❌ Not authenticated, showing modal");
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

    setIsSubmitting(true);
    
    try {
      const sessionRes = await fetch("/api/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // Ensure cookies are sent
        body: JSON.stringify({ indexedDocs: [] }),
      });

      console.log("Session creation response:", sessionRes.status);

      if (!sessionRes.ok) {
        if (sessionRes.status === 401) {
          console.log("❌ 401 response, showing auth modal");
          setShowAuthModal(true);
          setIsSubmitting(false);
          return;
        }
        throw new Error("Failed to create session");
      }
      
      const { sessionId } = await sessionRes.json();
      console.log("✅ Session created:", sessionId);

      const crawlRes = await fetch("/api/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url: inputValue }),
      });

      if (!crawlRes.ok) {
        const error = await crawlRes.json();
        throw new Error(error.error || "Failed to start crawling");
      }

      await fetch(`/api/chat/sessions/${sessionId}/attach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ docUrl: inputValue }),
      });

      clearInput();
      setShowGradient(false);
      router.push(`/chat/${sessionId}`);
      
    } catch (error) {
      console.error("❌ Submit error:", error);
      setToast({
        message: error instanceof Error ? error.message : "Failed to process documentation URL",
        type: "error",
        visible: true,
      });
      setIsSubmitting(false);
    }
  };

  // Show loading state while checking auth
  if (isCheckingAuth) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-black">
        <div className="text-white">Checking authentication...</div>
      </div>
    );
  }

  // LOGGED OUT VIEW
  if (!isAuthenticated) {
    console.log("🎨 Rendering LOGGED OUT view");
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
              window.location.reload();
            }, 500);
          }} 
        />

        <Toast
          message={toast.message}
          type={toast.type}
          isVisible={toast.visible}
          onClose={() => setToast(prev => ({ ...prev, visible: false }))}
        />
      </div>
    );
  }

  // LOGGED IN VIEW
  console.log("🎨 Rendering LOGGED IN view with user:", userInfo);
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
                disabled={isSubmitting}
                placeholder={
                  isSubmitting 
                    ? "Creating your session..." 
                    : "Insert the Docs link (e.g. https://sequelize.org/docs/v7)"
                }
              />
            </div>
          </div>
        </div>
      </div>

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.visible}
        onClose={() => setToast(prev => ({ ...prev, visible: false }))}
      />
    </div>
  );
}