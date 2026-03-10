"use client";

import { Monitor, Cloud } from "lucide-react";

type LLMMode = "local" | "cloud" | null;

interface LLMIndicatorProps {
  mode: LLMMode;
  active: boolean;
}

export function LLMIndicator({ mode, active }: LLMIndicatorProps) {
  // When no mode reported yet (e.g. after restart), show idle local icon
  const effectiveMode = mode ?? "local";
  const isLocal = effectiveMode === "local";
  const Icon = isLocal ? Monitor : Cloud;

  const colorClass = active
    ? mode === null
      ? "text-foreground/60"
      : isLocal
        ? "text-green-500"
        : "text-amber-500"
    : "text-muted-foreground/30";

  const pulseClass = active ? "animate-pulse" : "";

  const label = active
    ? mode === null
      ? "LLM processing..."
      : isLocal
        ? "Using local LLM (Ollama)"
        : "Using cloud LLM (paid)"
    : mode
      ? isLocal
        ? "Last run: local LLM"
        : "Last run: cloud LLM"
      : "LLM idle";

  return (
    <div
      className={`flex items-center gap-1 transition-colors ${colorClass} ${pulseClass}`}
      title={label}
    >
      <Icon className="h-3.5 w-3.5" />
    </div>
  );
}
