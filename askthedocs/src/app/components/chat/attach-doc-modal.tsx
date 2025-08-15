"use client";

import { useState } from "react";
import { X, Plus, Link } from "lucide-react";

interface AttachDocModalProps {
  onAttach: (url: string) => void;
  onClose: () => void;
}

export function AttachDocModal({ onAttach, onClose }: AttachDocModalProps) {
  const [url, setUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!url.trim()) return;
    
    try {
      setIsSubmitting(true);
      await onAttach(url);
      setUrl("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div 
        className="relative z-10 w-full max-w-md mx-4 p-6 rounded-2xl"
        style={{
          background: 'rgba(26, 26, 26, 0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white rounded-lg transition-all duration-200"
          style={{ background: 'rgba(255, 255, 255, 0.1)' }}
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-6">
          <h2 className="text-xl font-light text-white mb-2">Attach Documentation</h2>
          <p className="text-sm text-gray-400">Add a documentation URL to this chat</p>
        </div>

        <div className="space-y-4">
          <div 
            className="relative rounded-lg border"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              borderColor: 'rgba(255, 255, 255, 0.2)',
            }}
          >
            <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
              <Link className="w-5 h-5 text-gray-400" />
            </div>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSubmit();
                }
              }}
              placeholder="https://docs.example.com"
              disabled={isSubmitting}
              className="w-full bg-transparent text-white placeholder-gray-400 pl-12 pr-4 py-3 focus:outline-none"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={!url.trim() || isSubmitting}
            className="w-full flex items-center justify-center gap-2 p-3 rounded-lg transition-all duration-200 disabled:opacity-50"
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
            }}
          >
            <Plus className="w-5 h-5 text-white" />
            <span className="text-white">
              {isSubmitting ? "Attaching..." : "Attach Documentation"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}