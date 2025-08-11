"use client"
import { useState, useRef, useEffect } from "react";
import {
  ArrowUp,
  Edit,
  Search,
  BookOpen,
  Menu,
  X,
} from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [showGradient, setShowGradient] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const sidebarItems = [
    { icon: Edit, label: "New chat" },
    { icon: Search, label: "Search chats" },
  ];

  const chatHistory = [
    "Testing message clarity",
    "Email validation in Sequelize",
    "Email validation in Sequelize",
    "Reeru AI CV description",
    "Log input in Codeforces",
    "API optimization for YT app",
    "Malcolm X transformation",
    "Next.js MongoDB MERN comparison",
    "Logo PNG dan SVG",
    "Weekly usage limits explained",
    "Convert Gemini to TS",
    "ES6 axios update",
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setShowGradient(false);
    setSidebarOpen(false);

    // Simulate AI response
    setTimeout(() => {
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content:
          "Got it — I see your message loud and clear.\nWhat are we testing?",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMessage]);
    }, 1000);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="relative w-full h-screen overflow-hidden">
      {/* Background gradient - now at the root level so it's behind everything */}
      {showGradient && (
        <div
          className="absolute inset-0 gradient-bg fade-gradient"
          style={{
            opacity: showGradient ? 1 : 0,
            transition: "opacity 0.8s ease-in-out",
            zIndex: 0
          }}
        />
      )}
      
      {/* Main container */}
      <div className="relative flex h-full text-white font-sans z-10">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar with glassmorphic effect */}
        <div
          className={`
            fixed md:relative z-50 md:z-auto
            w-64 md:w-64 
            flex flex-col
            transform transition-transform duration-300 ease-in-out
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
            h-full
          `}
          style={{
            background: 'rgba(26, 26, 26, 0.4)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            borderRight: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <div className="md:hidden absolute top-4 right-4 z-10">
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-2 text-gray-400 hover:text-white rounded-lg transition-all duration-200"
              style={{ background: 'rgba(255, 255, 255, 0.1)' }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div 
            className="p-4 border-b"
            style={{
              borderColor: 'rgba(255, 255, 255, 0.1)',
              background: 'rgba(255, 255, 255, 0.03)'
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-white/80" />
              </div>
            </div>
          </div>

          <div className="p-4 space-y-2">
            {sidebarItems.map((item, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-2 rounded-lg cursor-pointer text-gray-300 transition-all duration-200 hover:bg-white/10"
              >
                <item.icon className="w-4 h-4" />
                <span className="text-sm">{item.label}</span>
              </div>
            ))}
          </div>

          <div className="flex-1 p-4 overflow-hidden">
            <div className="text-xs text-gray-400 mb-3">Chats</div>
            <div className="space-y-1 overflow-y-auto h-full pr-2 hide-scrollbar">
              {chatHistory.map((chat, index) => (
                <div
                  key={index}
                  className={`text-sm p-2 rounded-lg cursor-pointer transition-all duration-200 ${
                    index === 1
                      ? "text-white"
                      : "text-gray-400 hover:bg-white/5"
                  }`}
                  style={index === 1 ? {
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.15)'
                  } : {}}
                >
                  {chat}
                </div>
              ))}
            </div>
          </div>

          <div 
            className="p-4 border-t"
            style={{
              borderColor: 'rgba(255, 255, 255, 0.1)',
              background: 'rgba(255, 255, 255, 0.03)'
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-sm font-medium">
                M
              </div>
              <div>
                <div className="text-sm font-medium text-white/90">Rashid</div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col relative overflow-hidden">
          {/* Header */}
          <div 
            className="relative z-10 p-3 md:p-4 border-b flex items-center justify-between flex-shrink-0"
            style={{
              borderColor: 'rgba(255, 255, 255, 0.2)',
              background: 'rgba(26, 26, 26, 0.3)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
            }}
          >
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSidebarOpen(true)}
                className="md:hidden p-2 text-gray-400 hover:text-white hover:bg-white/20 rounded-lg transition-all duration-200 mr-2"
              >
                <Menu className="w-5 h-5" />
              </button>
              <span className="font-normal font-sans text-sm md:text-base">
                Askthedocs 
              </span>
            </div>
            <div className="flex items-center gap-2 md:gap-4">
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 relative z-10 overflow-y-auto hide-scrollbar">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center px-4 md:px-8">
                {/* Welcome content */}
                <div className="text-center max-w-2xl mb-8 md:-mt-32">
                  <h1 className="text-2xl md:text-4xl font-light mb-4 font-sans">
                    AI That Actually Read the Docs
                  </h1>
                  <p className="text-gray-300 text-base md:text-muted leading-relaxed font-light font-sans">
                    Askthedocs pulls directly from your documentation url in real time and gives answers you can trust without hallucination (RAG).
                  </p>
                </div>
                
                {/* Desktop: Center textarea (only when no messages) */}
                <div className="hidden md:block w-full max-w-3xl">
                  <div 
                    className="relative rounded-full border transition-all duration-200"
                    style={{
                      background: 'rgba(26, 26, 26, 0.6)',
                      backdropFilter: 'blur(10px)',
                      borderColor: 'rgba(255, 255, 255, 0.3)',
                      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                    }}
                  >
                    <textarea
                      ref={inputRef}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Insert the Docs link (e.g. https://sequelize.org/docs/v7)"
                      className="w-full bg-transparent text-white placeholder-gray-400 p-4 pr-16 resize-none focus:outline-none min-h-[56px] max-h-32 text-base rounded-full"
                      rows={1}
                    />
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <button
                        onClick={handleSend}
                        disabled={!inputValue.trim()}
                        className="w-10 h-10 bg-white/90 backdrop-blur-sm text-black rounded-full hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 border border-white/30 flex items-center justify-center"
                      >
                        <ArrowUp className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto p-3 md:p-6 space-y-4 md:space-y-6">
                {messages.map((message) => (
                  <div key={message.id} className="space-y-4">
                    {message.role === "user" ? (
                      <div className="flex justify-end">
                        <div 
                          className="rounded-2xl px-3 md:px-4 py-2 max-w-xs md:max-w-sm"
                          style={{
                            background: 'rgba(255, 255, 255, 0.2)',
                            backdropFilter: 'blur(10px)',
                            border: '1px solid rgba(255, 255, 255, 0.3)'
                          }}
                        >
                          <p className="text-sm">{message.content}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="prose prose-invert max-w-none">
                          <p className="text-gray-200 whitespace-pre-line text-sm md:text-base">
                            {message.content}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 text-gray-400">
                          <button className="p-1 hover:bg-white/20 hover:backdrop-blur-lg rounded border border-transparent hover:border-white/30 transition-all duration-200">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M8 2a1 1 0 000 2h2a1 1 0 100-2H8z" />
                              <path d="M3 5a2 2 0 012-2h1a3 3 0 003-3h2a3 3 0 003 3h1a2 2 0 012 2v6h-4.586l1.293-1.293a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L10.414 13H15v3a2 2 0 01-2 2H5a2 2 0 01-2-2V5z" />
                            </svg>
                          </button>
                          <button className="p-1 hover:bg-white/20 hover:backdrop-blur-lg rounded border border-transparent hover:border-white/30 transition-all duration-200">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                            </svg>
                          </button>
                          <button className="p-1 hover:bg-white/20 hover:backdrop-blur-lg rounded border border-transparent hover:border-white/30 transition-all duration-200">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 11-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732L14.146 12.8l-1.179 4.456a1 1 0 01-1.934 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732L9.854 7.2l1.179-4.456A1 1 0 0112 2z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Desktop: Bottom textarea (when messages exist) */}
          {messages.length > 0 && (
            <div className="hidden md:block relative z-10 p-3 md:p-6 flex-shrink-0">
              <div className="max-w-3xl mx-auto">
                <div 
                  className="relative rounded-full border transition-all duration-200"
                  style={{
                    background: 'rgba(26, 26, 26, 0.6)',
                    backdropFilter: 'blur(10px)',
                    borderColor: 'rgba(255, 255, 255, 0.3)',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                  }}
                >
                  <textarea
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Insert the Docs"
                    className="w-full bg-transparent text-white placeholder-gray-400 p-4 pr-16 resize-none focus:outline-none min-h-[56px] max-h-32 text-base rounded-full"
                    rows={1}
                  />
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <button
                      onClick={handleSend}
                      disabled={!inputValue.trim()}
                      className="w-10 h-10 bg-white/90 backdrop-blur-sm text-black rounded-full hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 border border-white/30 flex items-center justify-center"
                    >
                      <ArrowUp className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Mobile: Fixed bottom textarea */}
          <div className="md:hidden fixed bottom-0 left-0 right-0 p-3 border-t z-50"
            style={{
              background: 'rgba(26, 26, 26, 0.95)',
              backdropFilter: 'blur(10px)',
              borderColor: 'rgba(255, 255, 255, 0.1)'
            }}
          >
            <div 
              className="relative rounded-full border transition-all duration-200"
              style={{
                background: 'rgba(26, 26, 26, 0.8)',
                borderColor: 'rgba(255, 255, 255, 0.3)',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
              }}
            >
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Insert the Docs"
                className="w-full bg-transparent text-white placeholder-gray-400 p-4 pr-16 resize-none focus:outline-none min-h-[56px] max-h-32 text-base rounded-full"
                rows={1}
              />
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim()}
                  className="w-10 h-10 bg-white/90 backdrop-blur-sm text-black rounded-full hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 border border-white/30 flex items-center justify-center"
                >
                  <ArrowUp className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Mobile spacing to prevent content hiding behind fixed textarea */}
          <div className="md:hidden h-20"></div>
        </div>
      </div>
    </div>
  );
}