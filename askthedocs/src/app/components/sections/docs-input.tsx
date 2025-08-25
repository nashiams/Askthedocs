import { DocInput } from "../chat/doc-input";

interface DocumentationInputProps {
  handleSubmit: () => Promise<void>;
  isSubmitting: boolean;
  isCrawling: boolean;
}

export function DocumentationInput({ 
  handleSubmit, 
  isSubmitting, 
  isCrawling 
}: DocumentationInputProps) {
  return (
    <div className="flex-1 relative z-10 flex flex-col items-center justify-center px-4 md:px-8">
      <div className="text-center max-w-2xl mb-8">
        <h1 className="text-2xl md:text-4xl font-light mb-4 font-sans">
          Start with Documentation
        </h1>
        <p className="text-gray-300 text-base md:text-lg leading-relaxed font-light font-sans">
          Enter a documentation URL to begin asking questions
        </p>
      </div>
      
      <div className="w-full max-w-3xl">
        <DocInput 
          onSubmit={handleSubmit}
          disabled={isSubmitting || isCrawling}
          placeholder={
            isCrawling 
              ? "Indexing documentation..." 
              : isSubmitting
              ? "Processing..." 
              : "Insert the Docs link (e.g. https://sequelize.org/docs/v7)"
          }
        />
      </div>
    </div>
  );
}