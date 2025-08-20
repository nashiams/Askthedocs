import { CrawlProgressData, AttachedDoc, ToastState } from "@/types/frontend/chat";

export function handleCrawlProgress(
  data: CrawlProgressData,
  setAttachedDocs: React.Dispatch<React.SetStateAction<AttachedDoc[]>>,
  setToast: React.Dispatch<React.SetStateAction<ToastState>>
) {
  console.log("Crawl progress received:", data);
  
  // The data should contain the URL
  if (!data.url) {
    console.warn("Progress update missing URL:", data);
    return;
  }
  
  if (data.status === "complete") {
    setAttachedDocs(prev => prev.map(doc => 
      doc.url === data.url 
        ? { ...doc, status: "ready", progress: 100 }
        : doc
    ));
    
    // Only show toast for docs attached in this session
    setToast({
      message: `Documentation ready: ${new URL(data.url).hostname}`,
      type: "success",
      visible: true
    });
  } else if (data.status === "crawling" || data.status === "embedding") {
    setAttachedDocs(prev => prev.map(doc => 
      doc.url === data.url 
        ? { ...doc, progress: data.percentage || doc.progress }
        : doc
    ));
  } else if (data.status === "error") {
    setAttachedDocs(prev => prev.map(doc => 
      doc.url === data.url 
        ? { ...doc, status: "failed" }
        : doc
    ));
    
    setToast({
      message: `Failed to index ${new URL(data.url).hostname}`,
      type: "error",
      visible: true
    });
  }
}