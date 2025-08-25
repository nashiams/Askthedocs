"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useInput } from "@/app/providers/input-context";
import {  ToastState } from "@/types/frontend/home";
import { useAblyConnection } from "./hooks/use-ably-connection";
import { useAuthentication } from "./hooks/use-auth";
import { useCrawlHandler } from "./hooks/use-crawl-handler";
import { AuthLoadingScreen } from "./components/auth/auth-loading";
import { UnauthenticatedView } from "./components/home-screens/unauthenticated-view";
import { AuthenticatedView } from "./components/home-screens/authenticated-view";


export default function HomePage() {
  const router = useRouter();
  const { inputValue, clearInput } = useInput();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState<ToastState>({ visible: false });

  // Use custom authentication hook
  const { 
    isAuthenticated, 
    userInfo, 
    isCheckingAuth, 
    checkAuthStatus 
  } = useAuthentication();

  // Use custom crawl handler hook
  const {
    crawlStatus,
    isCrawling,
    setCrawlStatus,
    handleCrawlProgress,
    handleSubmit: performCrawl
  } = useCrawlHandler(router, clearInput);

  // Use Ably connection for real-time updates
  useAblyConnection(
    userInfo?.email || null,
    handleCrawlProgress,
    isCrawling,
    true,
    ["complete", "error"]
  );

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const handleSubmit = async () => {
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }

    setIsSubmitting(true);
    try {
      await performCrawl(inputValue, setToast);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isCheckingAuth) {
    return <AuthLoadingScreen />;
  }

  if (!isAuthenticated) {
    return (
      <UnauthenticatedView
        showAuthModal={showAuthModal}
        setShowAuthModal={setShowAuthModal}
        checkAuthStatus={checkAuthStatus}
        toast={toast}
        setToast={setToast}
      />
    );
  }

  return (
    <AuthenticatedView
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
      userInfo={userInfo}
      handleSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      isCrawling={isCrawling}
      crawlStatus={crawlStatus}
      setCrawlStatus={setCrawlStatus}
      toast={toast}
      setToast={setToast}
    />
  );
}