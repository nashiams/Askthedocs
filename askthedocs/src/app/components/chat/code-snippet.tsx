"use client";

import { useState } from "react";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";

interface CodeSnippetProps {
  snippet: {
    code: string;
    language?: string;
    purpose?: string;
    sourceUrl?: string;
  };
  inline?: boolean;
}

export function CodeSnippet({ snippet, inline = false }: CodeSnippetProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(snippet.code);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  if (inline) {
    return (
      <code 
        className="px-1 py-0.5 rounded text-sm" 
        style={{
          background: 'rgba(255, 255, 255, 0.1)',
          color: '#f97316'
        }}
      >
        {snippet.code}
      </code>
    );
  }

  return (
    <div 
      className="rounded-lg overflow-hidden"
      style={{
        background: 'rgba(0, 0, 0, 0.3)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
      }}
    >
      {/* Header with purpose and collapse button */}
      {snippet.purpose && (
        <div 
          className="px-4 py-2 border-b flex items-center justify-between"
          style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}
        >
          <span className="text-sm text-gray-300">{snippet.purpose}</span>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 text-gray-400 hover:text-white transition-all"
          >
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>
      )}
      
      {/* Code content - collapsible */}
      {isExpanded && (
        <>
          <div className="relative">
            {/* Top bar with language and copy button */}
            <div className="absolute top-2 right-2 flex items-center gap-2 z-10">
              {snippet.language && (
                <span 
                  className="px-2 py-1 rounded text-xs text-gray-400" 
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)'
                  }}
                >
                  {snippet.language}
                </span>
              )}
              <button
                onClick={handleCopy}
                className="p-2 text-gray-400 hover:text-white rounded transition-all"
                style={{ 
                  background: 'rgba(255, 255, 255, 0.1)' 
                }}
              >
                {isCopied ? (
                  <Check className="w-4 h-4 text-green-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
            
            {/* Syntax highlighted code */}
            <SyntaxHighlighter
              language={snippet.language || 'javascript'}
              style={tomorrow}
              customStyle={{
                background: 'transparent',
                padding: '1rem',
                paddingTop: '2.5rem',
                margin: 0,
                fontSize: '0.875rem',
                lineHeight: '1.5'
              }}
            >
              {snippet.code}
            </SyntaxHighlighter>
          </div>
          
          {/* Footer with source URL */}
          {snippet.sourceUrl && (
            <div 
              className="px-4 py-2 border-t"
              style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}
            >
              
              <a
                href={snippet.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-all"
              >
                <ExternalLink className="w-3 h-3" />
                View in documentation
              </a>
            </div>
          )}
        </>
      )}
    </div>
  );
}