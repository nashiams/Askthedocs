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
  isStreaming?: boolean;
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
// Function to format the assistant's structured response
  const formatAssistantContent = (content: string) => {
    // Remove numbered lists and clean up formatting
    let formatted = content;
    
    // Replace patterns
    formatted = formatted
      // Remove "1. **Direct solution first**:" and just show content
      .replace(/^\d+\.\s*\*\*Direct solution first\*\*:\s*/gim, '')
      // Replace "2. **Big Picture**:" with styled section
      .replace(/^\d+\.\s*\*\*Big Picture\*\*:\s*/gim, '\n### Description\n')
      // Replace "3. **WHERE THIS GOES**:" 
      .replace(/^\d+\.\s*\*\*WHERE THIS GOES\*\*:\s*/gim, '\n### Where this goes\n')
      // Replace "4. **Code example with key parts highlighted**:"
      .replace(/^\d+\.\s*\*\*Code example with key parts highlighted\*\*:\s*/gim, '\n### Code example\n')
      // Replace "5. **What you'll see**:"
      .replace(/^\d+\.\s*\*\*What you'll see\*\*:\s*/gim, '\n### What you\'ll see\n')
      // Remove any remaining numbered list formatting
      .replace(/^\d+\.\s*/gm, '')
      // Clean up extra asterisks
      .replace(/\*\*(.*?)\*\*/g, '$1');
    
    return formatted;
  };

  // Define a type for parsed sections
  type ParsedSection =
    | { type: 'text'; content: string }
    | { type: 'section'; title: string; content: string }
    | { type: 'code'; content: string };

  // Parse content into sections
  const parseFormattedContent = (content: string): ParsedSection[] => {
    const sections: ParsedSection[] = [];
    const lines = content.split('\n');
    let currentSection: ParsedSection = { type: 'text', content: '' };
    
    for (const line of lines) {
      if (line.startsWith('### ')) {
        if (currentSection.content) {
          sections.push(currentSection);
        }
        currentSection = {
          type: 'section',
          title: line.replace('### ', ''),
          content: ''
        };
      } else if (line.startsWith('```')) {
        // Start of code block
        if (currentSection.content) {
          sections.push(currentSection);
        }
        currentSection = { type: 'code', content: line + '\n' };
      } else if (currentSection.type === 'code' && !line.includes('```')) {
        currentSection.content += line + '\n';
      } else if (currentSection.type === 'code' && line.includes('```')) {
        currentSection.content += line;
        sections.push(currentSection);
        currentSection = { type: 'text', content: '' };
      } else {
        currentSection.content += (currentSection.content ? '\n' : '') + line;
      }
    }
    
    if (currentSection.content) {
      sections.push(currentSection);
    }
    
    return sections;
  };

  return (
    <div className="max-w-3xl mx-auto p-3 md:p-6 space-y-4 md:space-y-6">
      {messages.map((message) => (
        <div key={message.id} className="space-y-4">
          {message.role === "user" ? (
            // User message (unchanged)
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
              
              {/* Format and display content */}
              <div className="prose prose-invert max-w-none">
                {parseFormattedContent(formatAssistantContent(message.content)).map((section, index) => {
                  if (section.type === 'section') {
                    return (
                      <div key={index} className="mt-4">
                        <h4 className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-2">
                          {section.title}:
                        </h4>
                        <p className="text-gray-200 text-sm md:text-base">
                          {section.content}
                        </p>
                      </div>
                    );
                  } else if (section.type === 'code') {
                    const codeMatch = section.content.match(/```(\w+)?\n([\s\S]*?)```/);
                    if (codeMatch) {
                      return (
                        <div key={index} className="my-4">
                          <CodeSnippet 
                            snippet={{
                              code: codeMatch[2].trim(),
                              language: codeMatch[1] || 'javascript'
                            }} 
                          />
                        </div>
                      );
                    }
                  }
                  return (
                    <p key={index} className="text-gray-200 text-sm md:text-base">
                      {section.content}
                    </p>
                  );
                })}
              </div>

              {/* Only show snippets and sources after streaming is complete */}
              {!message.isStreaming && (
                <>
                  {message.snippets && message.snippets.length > 0 && (
                    <div className="space-y-3 mt-4">
                      <div className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                        From Documentation:
                      </div>
                      {message.snippets.map((snippet, index) => (
                        <CodeSnippet key={index} snippet={snippet} />
                      ))}
                    </div>
                  )}

                  {message.sources && message.sources.length > 0 && (
                    <div className="space-y-2 mt-4">
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
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs text-gray-400 hover:text-white transition-all"
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
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}