"use client";

import { cn } from "@/lib/utils";
import { forwardRef } from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "secondary", size = "md", children, ...props }, ref) => {
    const base =
      "inline-flex items-center justify-center gap-2 font-medium rounded-[14px] transition-all " +
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/25 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent " +
      "disabled:opacity-40 disabled:cursor-not-allowed";

    const variants = {
      primary:
        "bg-[var(--accent)] text-[#03150c] border border-transparent hover:bg-[var(--accent-strong)] shadow-[0_18px_36px_var(--accent-glow)]",
      secondary:
        "bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-primary)] hover:bg-[var(--bg-hover)] hover:border-[var(--border-strong)]",
      ghost:
        "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]",
      danger:
        "bg-red-500/10 text-red-600 dark:text-red-300 border border-red-500/20 hover:bg-red-500/16",
      outline:
        "bg-transparent border border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-border)] hover:bg-[var(--accent-muted)]",
    };

    const sizes = {
      sm: "text-xs px-3.5 py-2 rounded-xl",
      md: "text-sm px-4.5 py-2.5",
      lg: "text-base px-5 py-3",
    };

    return (
      <button ref={ref} className={cn(base, variants[variant], sizes[size], className)} {...props}>
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
