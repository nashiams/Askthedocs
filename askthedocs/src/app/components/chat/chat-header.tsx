import { Menu } from "lucide-react";

interface ChatHeaderProps {
  onMenuClick: () => void;
}

export function ChatHeader({ onMenuClick }: ChatHeaderProps) {
  return (
    <div 
      className="relative z-10 p-3 md:p-4 border-b flex items-center justify-between flex-shrink-0"
      style={{
        borderColor: 'rgba(255, 255, 255, 0.2)',
        background: 'rgba(26, 26, 26, 0.3)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <div className="flex items-center gap-2">
        <button
          onClick={onMenuClick}
          className="md:hidden p-2 text-gray-400 hover:text-white hover:bg-white/20 rounded-lg transition-all duration-200 mr-2"
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="font-normal font-sans text-sm md:text-base">
          AskTheDocs
        </span>
      </div>
    </div>
  );
}