import { useState } from "react";
import { ToastState } from "@/types/frontend/chat";

export function useToast() {
  const [toast, setToast] = useState<ToastState>({ 
    message: "", 
    type: "info", 
    visible: false 
  });

  const showToast = (message: string, type: ToastState['type']) => {
    setToast({ message, type, visible: true });
  };

  const hideToast = () => {
    setToast(prev => ({ ...prev, visible: false }));
  };

  return { toast, setToast, showToast, hideToast };
}