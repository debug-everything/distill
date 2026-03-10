"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Brain,
  Sun,
  Moon,
  Monitor,
  ALargeSmall,
  Newspaper,
  Search,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/settings-store";

export function Navbar() {
  const pathname = usePathname();
  const { theme, setTheme, textSize, setTextSize } = useSettings();

  const cycleTheme = () => {
    const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setTheme(next);
  };

  const cycleTextSize = () => {
    const next = textSize === "sm" ? "base" : textSize === "base" ? "lg" : "sm";
    setTextSize(next);
  };

  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center gap-1 px-6 py-3">
        <Link href="/" className="mr-4 flex items-center gap-2.5">
          <Brain className="h-6 w-6" />
          <span className="text-xl font-bold tracking-tight">Distill</span>
        </Link>

        <nav className="flex items-center gap-1">
          <Link href="/">
            <Button
              variant={pathname === "/" ? "secondary" : "ghost"}
              size="sm"
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Capture</span>
            </Button>
          </Link>
          <Link href="/digest">
            <Button
              variant={pathname === "/digest" ? "secondary" : "ghost"}
              size="sm"
              className="gap-1.5"
            >
              <Newspaper className="h-4 w-4" />
              <span className="hidden sm:inline">Digest</span>
            </Button>
          </Link>
          <Link href="/knowledge">
            <Button
              variant={pathname === "/knowledge" ? "secondary" : "ghost"}
              size="sm"
              className="gap-1.5"
            >
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Knowledge</span>
            </Button>
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={cycleTextSize}
            title={`Text size: ${textSize}`}
            className="h-8 w-8"
          >
            <ALargeSmall className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={cycleTheme}
            title={`Theme: ${theme}`}
            className="h-8 w-8"
          >
            <ThemeIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
