import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { ConnectionProvider } from "@/components/layout/connection-provider";
import { CommandPalette } from "@/components/layout/command-palette";
import { ThemeProvider } from "@/components/layout/theme-provider";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "ModelPilot - Local LLM Evaluation",
  description: "Build personal test suites, run evaluations across Ollama models, and visualize results.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var t = localStorage.getItem('pilot-sys-theme');
                  if (t === 'light') {
                    document.documentElement.classList.remove('dark');
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen`}>
        <ConnectionProvider>
          <ThemeProvider>
            <div className="app-shell flex h-screen overflow-hidden">
              <Sidebar />
              <main className="flex-1 overflow-y-auto overflow-x-hidden">{children}</main>
            </div>
            <CommandPalette />
          </ThemeProvider>
        </ConnectionProvider>
      </body>
    </html>
  );
}
