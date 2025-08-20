import { Plus, ArrowUp } from "lucide-react";

interface ChatInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  onAttach: () => void;
  disabled: boolean;
}

export function ChatInput({ value, onChange, onSend, onAttach, disabled }: ChatInputProps) {
  return (
    <div className="relative z-10 p-3 md:p-6 flex-shrink-0">
      <div className="max-w-3xl mx-auto">
        <div 
          className="relative rounded-full border transition-all duration-200"
          style={{
            background: 'rgba(26, 26, 26, 0.6)',
            backdropFilter: 'blur(10px)',
            borderColor: 'rgba(255, 255, 255, 0.3)',
          }}
        >
          <textarea
            value={value}
            onChange={onChange}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="Ask a question about your documentation..."
            disabled={disabled}
            className="w-full bg-transparent text-white placeholder-gray-400 p-4 pr-24 resize-none focus:outline-none min-h-[56px] max-h-32 text-base rounded-full"
            rows={1}
          />
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex gap-2">
            <button
              onClick={onAttach}
              className="w-10 h-10 bg-white/10 backdrop-blur-sm text-white rounded-full hover:bg-white/20 transition-all duration-200 border border-white/30 flex items-center justify-center"
            >
              <Plus className="w-5 h-5" />
            </button>
            <button
              onClick={onSend}
              disabled={!value.trim() || disabled}
              className="w-10 h-10 bg-white/90 backdrop-blur-sm text-black rounded-full hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 border border-white/30 flex items-center justify-center"
            >
              <ArrowUp className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}