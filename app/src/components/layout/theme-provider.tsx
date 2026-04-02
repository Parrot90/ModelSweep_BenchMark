"use client";

import { useEffect } from "react";
import { useThemeStore } from "@/store/theme-store";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const { theme, setTheme } = useThemeStore();

    // Hydrate from localStorage on mount
    useEffect(() => {
        const stored = localStorage.getItem("pilot-sys-theme") as "light" | "dark" | null;
        if (stored && stored !== theme) {
            setTheme(stored);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Sync dark class on <html>
    useEffect(() => {
        const root = document.documentElement;
        if (theme === "dark") {
            root.classList.add("dark");
        } else {
            root.classList.remove("dark");
        }
    }, [theme]);

    return <>{children}</>;
}
