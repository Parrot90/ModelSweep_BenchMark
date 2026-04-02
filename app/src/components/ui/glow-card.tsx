"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface GlowCardProps {
  children: React.ReactNode;
  className?: string;
  glowColor?: string;
  animate?: boolean;
  delay?: number;
  onClick?: () => void;
}

export function GlowCard({
  children,
  className,
  glowColor,
  animate = true,
  delay = 0,
  onClick,
}: GlowCardProps) {
  const sharedClass = cn(
    "relative overflow-hidden bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-[var(--radius-lg)]",
    "shadow-[var(--shadow-sm)] backdrop-blur-xl",
    onClick && "cursor-pointer hover:border-[var(--border-strong)] hover:-translate-y-0.5 transition-all",
    className
  );

  const inner = (
    <>
      {glowColor && (
        <div
          className="absolute inset-0 -z-10 blur-3xl rounded-full opacity-60 pointer-events-none"
          style={{ background: glowColor }}
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),transparent_35%)] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent_35%)]" />
      {children}
    </>
  );

  if (!animate) {
    return (
      <div onClick={onClick} className={sharedClass}>
        {inner}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1], delay }}
      onClick={onClick}
      className={sharedClass}
    >
      {inner}
    </motion.div>
  );
}
