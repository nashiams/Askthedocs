"use client";


import { ExternalLink } from "lucide-react";
import { CodeSnippet } from "./code-snippet";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  snippets?: any[];
  sources?: string[];
  timestamp: Date;
  type?: "answer" | "comparison";
}

interface MessageListProps {
  messages: Message[];
}

export function MessageList({ messages }: MessageListProps) {
  // Empty state
  if (messages.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center px-4 md:px-8">
        <div className="text-center max-w-2xl mb-8">
          <h1 className="text-2xl md:text-4xl font-light mb-4 font-sans text-white">
            Ask About Your Documentation
          </h1>
          <p className="text-gray-300 text-base md:text-lg leading-relaxed font-light font-sans">
            Start by asking a question about your attached documentation
          </p>
        </div>
      </div>
    );
  }

  // Function to parse message content and extract code blocks
  const parseMessageContent = (content: string) => {
    const parts = [];
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      // Add text before code block
      if (match.index > lastIndex) {
        parts.push({
          type: 'text',
          content: content.slice(lastIndex, match.index)
        });
      }

      // Add code block
      parts.push({
        type: 'code',
        language: match[1] || 'javascript',
        content: match[2].trim()
      });

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < content.length) {
      parts.push({
        type: 'text',
        content: content.slice(lastIndex)
      });
    }

    return parts.length > 0 ? parts : [{ type: 'text', content }];
  };

  return (
    <div className="max-w-3xl mx-auto p-3 md:p-6 space-y-4 md:space-y-6">
      {messages.map((message) => (
        <div key={message.id} className="space-y-4">
          {message.role === "user" ? (
            // User message bubble
            <div className="flex justify-end">
              <div 
                className="rounded-2xl px-3 md:px-4 py-2 max-w-xs md:max-w-sm"
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255, 255, 255, 0.3)'
                }}
              >
                <p className="text-sm text-white">{message.content}</p>
              </div>
            </div>
          ) : (
            // Assistant message
            <div className="space-y-4">
              {/* Show label if it's a comparison */}
              {message.type === "comparison" && (
                <div className="flex items-center gap-2">
                  <div 
                    className="px-2 py-1 rounded text-xs font-medium text-blue-400"
                    style={{
                      background: 'rgba(59, 130, 246, 0.1)',
                      border: '1px solid rgba(59, 130, 246, 0.2)'
                    }}
                  >
                    COMPARISON RESULT
                  </div>
                </div>
              )}
              
              {/* Message content with parsed code blocks */}
              <div className="prose prose-invert max-w-none">
                <div className="text-gray-200 whitespace-pre-wrap text-sm md:text-base">
                  {parseMessageContent(message.content).map((part, index) => {
                    if (part.type === 'code') {
                      return (
                        <div key={index} className="my-4">
                          <CodeSnippet 
                            snippet={{
                              code: part.content,
                              language: part.language,
                              purpose: `Code example`
                            }} 
                            inline={false}
                          />
                        </div>
                      );
                    }
                    return (
                      <span key={index}>{part.content}</span>
                    );
                  })}
                </div>
              </div>

              {/* Display snippets from API response */}
              {message.snippets && message.snippets.length > 0 && (
                <div className="space-y-3">
                  <div className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                    From Documentation:
                  </div>
                  {message.snippets.map((snippet, index) => (
                    <CodeSnippet 
                      key={index} 
                      snippet={{
                        code: snippet.code,
                        language: snippet.language || 'javascript',
                        purpose: snippet.purpose,
                        sourceUrl: snippet.sourceUrl
                      }} 
                    />
                  ))}
                </div>
              )}

              {/* Display source links */}
              {message.sources && message.sources.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                    Sources:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {message.sources.map((source, index) => (
                      <a
                        key={index}
                        href={source}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs text-gray-400 hover:text-white transition-all duration-200"
                        style={{
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                        }}
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>{new URL(source).hostname.replace('www.', '')}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Action buttons for assistant messages */}
              <div className="flex items-center gap-2 text-gray-400">
                <button 
                  className="p-1 hover:bg-white/10 rounded transition-all duration-200"
                  title="Copy"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M8 2a1 1 0 000 2h2a1 1 0 100-2H8z" />
                    <path d="M3 5a2 2 0 012-2h1a3 3 0 003-3h2a3 3 0 003 3h1a2 2 0 012 2v6h-4.586l1.293-1.293a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L10.414 13H15v3a2 2 0 01-2 2H5a2 2 0 01-2-2V5z" />
                  </svg>
                </button>
                <button 
                  className="p-1 hover:bg-white/10 rounded transition-all duration-200"
                  title="Like"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                  </svg>
                </button>
                <button 
                  className="p-1 hover:bg-white/10 rounded transition-all duration-200"
                  title="Flag"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 11-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732L14.146 12.8l-1.179 4.456a1 1 0 01-1.934 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732L9.854 7.2l1.179-4.456A1 1 0 0112 2z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}