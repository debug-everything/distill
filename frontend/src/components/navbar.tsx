"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Brain,
  Newspaper,
  Search,
  Plus,
  Rss,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReadingSettings } from "@/components/reading-settings";
import { LLMIndicator } from "@/components/llm-indicator";
import { fetchLLMStatus, type LLMStatus } from "@/lib/api";

export function Navbar() {
  const pathname = usePathname();

  const llmStatus = useQuery<LLMStatus>({
    queryKey: ["llmStatus"],
    queryFn: fetchLLMStatus,
    refetchInterval: (query) =>
      query.state.data?.is_active ? 1000 : 5000,
  });

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
          <Link href="/feed">
            <Button
              variant={pathname === "/feed" ? "secondary" : "ghost"}
              size="sm"
              className="gap-1.5"
            >
              <Rss className="h-4 w-4" />
              <span className="hidden sm:inline">Feed</span>
            </Button>
          </Link>
          <Link href="/knowledge">
            <Button
              variant={pathname === "/knowledge" ? "secondary" : "ghost"}
              size="sm"
              className="gap-1.5"
            >
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Ask</span>
            </Button>
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <LLMIndicator
            mode={llmStatus.data?.llm_mode ?? null}
            active={llmStatus.data?.is_active ?? false}
          />
          <ReadingSettings />
          <Link href="/settings">
            <Button
              variant={pathname === "/settings" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
