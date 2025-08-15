"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

interface ToastProps {
  message: string;
  type?: "success" | "error" | "info";
  isVisible: boolean;
  onClose: () => void;
}

export function Toast({ message, type = "info", isVisible, onClose }: ToastProps) {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onClose();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  const bgColor = {
    success: "rgba(34, 197, 94, 0.1)",
    error: "rgba(239, 68, 68, 0.1)",
    info: "rgba(59, 130, 246, 0.1)",
  }[type];

  const borderColor = {
    success: "rgba(34, 197, 94, 0.3)",
    error: "rgba(239, 68, 68, 0.3)",
    info: "rgba(59, 130, 246, 0.3)",
  }[type];

  const textColor = {
    success: "text-green-400",
    error: "text-red-400",
    info: "text-blue-400",
  }[type];

  return (
    <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-2">
      <div
        className="flex items-center gap-3 px-4 py-3 rounded-lg"
        style={{
          background: bgColor,
          backdropFilter: "blur(10px)",
          border: `1px solid ${borderColor}`,
        }}
      >
        <p className={`text-sm ${textColor}`}>{message}</p>
        <button
          onClick={onClose}
          className="p-1 hover:bg-white/10 rounded transition-all"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>
    </div>
  );
}