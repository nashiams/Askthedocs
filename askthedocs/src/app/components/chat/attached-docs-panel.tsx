"use client";

import { X, FileText, Loader2, CheckCircle, AlertCircle } from "lucide-react";

interface AttachedDoc {
  url: string;
  name: string;
  status: "ready" | "indexing" | "failed";
  progress?: number;
}

interface AttachedDocsPanelProps {
  docs: AttachedDoc[];
  onClose: () => void;
}

export function AttachedDocsPanel({ docs, onClose }: AttachedDocsPanelProps) {
  return (
    <div 
      className="absolute top-4 left-4 z-20 w-80 p-4 rounded-lg"
      style={{
        background: 'rgba(26, 26, 26, 0.95)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-white">Attached Documentation</h3>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-white rounded transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {docs.length === 0 ? (
        <p className="text-sm text-gray-400">No documentation attached yet</p>
      ) : (
        <div className="space-y-2">
          {docs.map((doc, index) => (
            <div
              key={index}
              className="p-3 rounded-lg"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              <div className="flex items-start gap-2">
                <FileText className="w-4 h-4 text-gray-400 mt-1" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{doc.name}</p>
                  <p className="text-xs text-gray-400 truncate">{doc.url}</p>
                  
                  {doc.status === "indexing" && (
                    <div className="mt-2">
                      <div className="flex items-center gap-2 mb-1">
                        <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
                        <span className="text-xs text-blue-400">Indexing...</span>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-1">
                        <div 
                          className="bg-blue-400 h-1 rounded-full transition-all duration-300"
                          style={{ width: `${doc.progress || 0}%` }}
                        />
                      </div>
                    </div>
                  )}
                  
                  {doc.status === "ready" && (
                    <div className="flex items-center gap-1 mt-1">
                      <CheckCircle className="w-3 h-3 text-green-400" />
                      <span className="text-xs text-green-400">Ready</span>
                    </div>
                  )}
                  
                  {doc.status === "failed" && (
                    <div className="flex items-center gap-1 mt-1">
                      <AlertCircle className="w-3 h-3 text-red-400" />
                      <span className="text-xs text-red-400">Failed</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}