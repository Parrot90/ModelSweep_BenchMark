"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  BarChart2,
  Cpu,
  Beaker,
  Settings,
  Zap,
  Sun,
  Moon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useConnectionStore } from "@/store/connection-store";
import { useThemeStore } from "@/store/theme-store";

const NAV_ITEMS = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/suite", icon: ClipboardList, label: "Test Suites" },
  { href: "/results", icon: BarChart2, label: "Results" },
  { href: "/models", icon: Cpu, label: "Models" },
  { href: "/playground", icon: Beaker, label: "Playground" },
];

const BOTTOM_ITEMS = [{ href: "/settings", icon: Settings, label: "Settings" }];

export function Sidebar() {
  const pathname = usePathname();
  const { status } = useConnectionStore();
  const { theme, toggleTheme } = useThemeStore();

  const statusColor = {
    connected: "bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]",
    connecting: "bg-yellow-500 animate-pulse",
    disconnected: "bg-red-500",
  }[status];

  return (
    <aside className="flex w-[88px] lg:w-[256px] flex-shrink-0 flex-col border-r border-[var(--border-primary)] bg-[var(--bg-elevated)]/95 backdrop-blur-2xl">
      <div className="p-6 border-b border-[var(--border-primary)]">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--accent-border)] bg-[linear-gradient(135deg,var(--accent-muted),transparent)] shadow-[0_12px_30px_var(--accent-glow)]">
            <Zap size={16} className="text-[var(--accent)]" />
          </div>
          <div className="hidden lg:block">
            <span className="block text-[var(--text-primary)] font-semibold tracking-tight text-base">ModelPilot</span>
            <span className="block text-[10px] font-mono uppercase tracking-[0.24em] text-[var(--text-muted)]">Evaluation Console</span>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-card)] px-4 py-3 shadow-[var(--shadow-sm)]">
          <div className="flex items-center gap-2">
            <div className={cn("w-1.5 h-1.5 rounded-full", statusColor)} />
            <span className="text-[var(--text-muted)] font-mono text-[10px] uppercase tracking-widest">
              {status === "connected" ? "Ollama Online" : status === "connecting" ? "Connecting..." : "Ollama Offline"}
            </span>
          </div>
          <span className="hidden lg:block text-[10px] font-mono uppercase tracking-widest text-[var(--text-secondary)]">Local</span>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1.5">
        {NAV_ITEMS.map((item) => (
          <NavItem key={item.href} {...item} active={pathname === item.href} />
        ))}
      </nav>

      <div className="p-4 space-y-1.5 border-t border-[var(--border-subtle)]">
        {BOTTOM_ITEMS.map((item) => (
          <NavItem key={item.href} {...item} active={pathname === item.href} />
        ))}

        <button
          onClick={toggleTheme}
          className={cn(
            "w-full flex items-center gap-3 rounded-2xl px-3.5 py-3 text-xs font-mono uppercase tracking-widest transition-all",
            "border border-transparent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]",
            "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] hover:border-[var(--border-primary)]"
          )}
        >
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          <span className="hidden lg:inline">{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
        </button>
      </div>
    </aside>
  );
}

interface NavItemProps {
  href: string;
  icon: React.ElementType;
  label: string;
  active: boolean;
}

function NavItem({ href, icon: Icon, label, active }: NavItemProps) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-2xl px-3.5 py-3 text-xs font-mono uppercase tracking-widest transition-all",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] border border-transparent",
        active
          ? "bg-[linear-gradient(135deg,var(--accent-muted),transparent)] text-[var(--accent)] border-[var(--accent-border)] shadow-[0_12px_30px_var(--accent-glow)]"
          : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] hover:border-[var(--border-primary)]"
      )}
    >
      <Icon size={14} />
      <span className="hidden lg:inline">{label}</span>
    </Link>
  );
}
