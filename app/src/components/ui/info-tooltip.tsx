'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';

interface InfoTooltipProps {
  text: string;
}

export function InfoTooltip({ text }: InfoTooltipProps) {
  const [visible, setVisible] = useState(false);

  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <Info
        size={13}
        className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-help flex-shrink-0"
      />
      {visible && (
        <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 w-56 px-3 py-2 text-xs text-[var(--text-secondary)] bg-[var(--tooltip-bg)] border border-[var(--tooltip-border)] rounded-2xl shadow-[var(--shadow-md)] backdrop-blur-xl pointer-events-none whitespace-normal leading-relaxed">
          {text}
        </span>
      )}
    </span>
  );
}
