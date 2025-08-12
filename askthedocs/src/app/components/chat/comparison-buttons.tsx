"use client";

interface ComparisonButtonsProps {
  technologies: string[];
  onCompare: (technology: string) => void;
  disabled?: boolean;
}

export function ComparisonButtons({ technologies, onCompare, disabled }: ComparisonButtonsProps) {
  return (
    <div className="max-w-3xl mx-auto px-3 md:px-6 pb-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-gray-400">Compare with:</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {technologies.map((tech) => (
          <button
            key={tech}
            onClick={() => onCompare(tech)}
            disabled={disabled}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-all duration-200 disabled:opacity-50"
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            }}
          >
            {tech}
          </button>
        ))}
      </div>
    </div>
  );
}