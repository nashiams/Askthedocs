import { BookOpen } from "lucide-react";

export function AppHeader() {
  return (
    <div 
      className="relative z-10 p-3 md:p-4 border-b flex items-center justify-center flex-shrink-0"
      style={{
        borderColor: 'rgba(255, 255, 255, 0.2)',
        background: 'rgba(26, 26, 26, 0.3)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <div className="flex items-center gap-2">
        <BookOpen className="w-5 h-5 text-white/80" />
        <span className="font-normal font-sans text-sm md:text-base">
          AskTheDocs
        </span>
      </div>
    </div>
  );
}