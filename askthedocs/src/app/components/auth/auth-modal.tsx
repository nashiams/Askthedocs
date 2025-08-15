"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { X, Github, Mail } from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSignIn = async (provider: "google" | "github") => {
    try {
      setIsLoading(true);
      setError(null);
      await signIn(provider, { 
        callbackUrl: window.location.pathname 
      });
    } catch (err) {
      setError("Failed to sign in. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
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

        <div className="text-center mb-6">
          <h2 className="text-2xl font-light text-white mb-2">Welcome to AskTheDocs</h2>
          <p className="text-gray-400 text-sm">Sign in to start asking questions</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={() => handleSignIn("google")}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 p-3 rounded-lg transition-all duration-200 disabled:opacity-50"
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
            }}
          >
            <Mail className="w-5 h-5 text-white" />
            <span className="text-white">Continue with Google</span>
          </button>

          <button
            onClick={() => handleSignIn("github")}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 p-3 rounded-lg transition-all duration-200 disabled:opacity-50"
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
            }}
          >
            <Github className="w-5 h-5 text-white" />
            <span className="text-white">Continue with GitHub</span>
          </button>
        </div>

        <p className="text-center text-gray-500 text-xs mt-6">
          By signing in, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
}