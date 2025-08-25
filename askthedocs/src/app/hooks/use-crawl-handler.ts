import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CrawlStatus, ToastState } from "@/types/frontend/home";
import { CrawlProgressData } from "@/types/frontend/chat";
import { validateUrl } from "@/utils/url-validator";

export function useCrawlHandler(
  router: ReturnType<typeof useRouter>,
  clearInput: () => void
) {
  const [crawlStatus, setCrawlStatus] = useState<CrawlStatus>({
    isVisible: false,
    status: "idle",
    progress: 0,
    message: ""
  });
  const [isCrawling, setIsCrawling] = useState(false);
  const handleCrawlProgress = useCallback((data: CrawlProgressData) => {
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
  }, [router]);

  const handleSubmit = async (
    inputValue: string,
    setToast: (toast: ToastState) => void
  ) => {
    if (!validateUrl(inputValue)) {
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

    try {
      const sessionRes = await fetch("/api/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ indexedDocs: [] }),
      });
      
      const { sessionId } = await sessionRes.json();
      
      const crawlRes = await fetch("/api/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          url: inputValue,
          sessionId
        }),
      });

      const crawlData = await crawlRes.json();
      
      if (crawlData.status === "ready" || crawlData.fromCache) {
        clearInput();
        router.push(`/chat/${sessionId}`);
      } else {
        setIsCrawling(true);
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
    }
  };

  return {
    crawlStatus,
    isCrawling,
    setCrawlStatus,
    setIsCrawling,
    handleCrawlProgress,
    handleSubmit
  };
}