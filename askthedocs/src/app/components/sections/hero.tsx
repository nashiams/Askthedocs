import { DocInput } from "../chat/doc-input";

interface HeroSectionProps {
  onDocInputClick: () => void;
}

export function HeroSection({ onDocInputClick }: HeroSectionProps) {
  return (
    <div className="flex-1 relative z-10 flex flex-col items-center justify-center px-4 md:px-8">
      <div className="text-center max-w-2xl mb-8">
        <h1 className="text-2xl md:text-4xl font-light mb-4 font-sans">
          AI That Actually Reads the Docs
        </h1>
        <p className="text-gray-300 text-base md:text-lg leading-relaxed font-light font-sans">
          AskTheDocs lets you crawl your documentation in real-time and get clear, accurate answers without hallucination.
        </p>
      </div>
      
      <div className="w-full max-w-3xl" onClick={onDocInputClick}>
        <DocInput 
          onSubmit={onDocInputClick}
          disabled={false}
          placeholder="Insert the Docs link (e.g. https://sequelize.org/docs/v7)"
        />
      </div>
    </div>
  );
}