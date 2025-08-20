import { AttachedDoc, ToastState } from "@/types/frontend/chat";

export async function handleAttachDoc(
  sessionId: string,
  url: string,
  setAttachedDocs: React.Dispatch<React.SetStateAction<AttachedDoc[]>>,
  setToast: React.Dispatch<React.SetStateAction<ToastState>>,
  setShowAttachModal: React.Dispatch<React.SetStateAction<boolean>>
) {
  try {
    const response = await fetch(`/api/chat/sessions/${sessionId}/attach`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ docUrl: url })
    });
    
    if (!response.ok) throw new Error("Failed to attach document");
    
    const data = await response.json();
    console.log("Attach response:", data);
    
    if (data.status === "indexing" || data.status === "queued") {
      // Add the document to the list
      setAttachedDocs(prev => [...prev, {
        url,
        name: new URL(url).hostname,
        status: "indexing",
        progress: 0
      }]);
    
      
      setToast({
        message: "Indexing documentation...",
        type: "info",
        visible: true
      });
    } else {
      // Document is ready immediately
      setAttachedDocs(prev => [...prev, {
        url,
        name: new URL(url).hostname,
        status: "ready",
        progress: 100
      }]);
    }
    
    setShowAttachModal(false);
  } catch (error) {
    console.error("Attach error:", error);
    setToast({
      message: "Failed to attach document",
      type: "error",
      visible: true
    });
  }
}