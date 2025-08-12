"use client";

import { ArrowUp } from "lucide-react";
import { useInput } from "@/app/providers/input-context";
import { KeyboardEvent } from "react";

interface DocInputProps {
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
}

export function DocInput({ 
  onSubmit, 
  placeholder = "Insert the Docs link (e.g. https://sequelize.org/docs/v7)",
  disabled = false 
}: DocInputProps) {
  const { inputValue, setInputValue } = useInput();

  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
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
        placeholder={placeholder}
        disabled={disabled}
        className="w-full bg-transparent text-white placeholder-gray-400 p-4 pr-16 resize-none focus:outline-none min-h-[56px] max-h-32 text-base rounded-full"
        rows={1}
      />
      <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
        <button
          onClick={onSubmit}
          disabled={!inputValue.trim() || disabled}
          className="w-10 h-10 bg-white/90 backdrop-blur-sm text-black rounded-full hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 border border-white/30 flex items-center justify-center"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}