"use client";

import { create } from "zustand";

type Theme = "light" | "dark";

interface ThemeState {
    theme: Theme;
    toggleTheme: () => void;
    setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
    theme: "dark",
    toggleTheme: () =>
        set((state) => {
            const next = state.theme === "dark" ? "light" : "dark";
            if (typeof window !== "undefined") {
                localStorage.setItem("pilot-sys-theme", next);
            }
            return { theme: next };
        }),
    setTheme: (theme) => {
        if (typeof window !== "undefined") {
            localStorage.setItem("pilot-sys-theme", theme);
        }
        set({ theme });
    },
}));
