"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn("surface-card flex flex-col items-center justify-center text-center p-12", className)}
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-muted)] text-[var(--accent)]">
        {icon}
      </div>
      <h3 className="text-[var(--text-primary)] font-semibold text-lg mb-2">{title}</h3>
      <p className="text-[var(--text-secondary)] text-sm max-w-sm leading-6">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </motion.div>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ message, onRetry, className }: ErrorStateProps) {
  return (
    <div className={cn("surface-card flex items-center gap-3 p-4 border-red-500/20 bg-red-500/10", className)}>
      <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
      <p className="text-red-400 dark:text-red-400 text-sm flex-1">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="text-red-400 text-xs underline hover:text-red-300 focus-visible:outline-none">
          Retry
        </button>
      )}
    </div>
  );
}
