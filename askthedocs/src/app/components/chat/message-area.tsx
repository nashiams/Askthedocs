import { useRef, useEffect } from "react";
import { MessageList } from "@/app/components/chat/message-list";
import { ComparisonButtons } from "@/app/components/chat/comparison-buttons";
import { Message } from "@/types/frontend/chat";

interface MessagesAreaProps {
  messages: Message[];
  showComparisons: boolean;
  availableComparisons: string[];
  isStreaming: boolean;
  onCompare: (technology: string) => Promise<void>;
}

export function MessagesArea({ 
  messages, 
  showComparisons, 
  availableComparisons, 
  isStreaming, 
  onCompare 
}: MessagesAreaProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="flex-1 relative z-10 overflow-y-auto hide-scrollbar">
      <MessageList messages={messages.map(msg => ({
        ...msg,
        snippets: msg.snippets
          ? msg.snippets.map((snippet: string | Record<string, unknown>) => 
              typeof snippet === "string"
                ? { content: snippet } // adapt to MessageSnippet shape
                : snippet
            )
          : undefined
      }))} />
      
      {/* Comparison Buttons */}
      {showComparisons && availableComparisons.length > 0 && (
        <ComparisonButtons 
          technologies={availableComparisons}
          onCompare={onCompare}
          disabled={isStreaming}
        />
      )}
      
      <div ref={messagesEndRef} />
    </div>
  );
}