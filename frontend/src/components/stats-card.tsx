"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Cloud, Monitor } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSettings, textSizeClasses } from "@/lib/settings-store";
import { fetchStats, type StatsResponse } from "@/lib/api";

function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function StatsCard() {
  const [expanded, setExpanded] = useState(false);
  const textSize = useSettings((s) => s.textSize);
  const ts = textSizeClasses[textSize];

  const { data, isLoading } = useQuery<StatsResponse>({
    queryKey: ["stats"],
    queryFn: fetchStats,
    staleTime: 30_000,
  });

  if (isLoading || !data) return null;

  const { totals, by_task, daily } = data;

  // Last 7 days for mini chart
  const last7 = daily.slice(0, 7).reverse();
  const maxCalls = Math.max(...last7.map((d) => d.calls), 1);

  return (
    <Card>
      <CardHeader
        className="cursor-pointer pb-3"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className={ts.body}>LLM Usage</CardTitle>
          <div className="flex items-center gap-3">
            <span className={`font-semibold ${ts.body}`}>
              {formatCost(totals.total_cost_usd)}
            </span>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                <Monitor className="mr-1 h-3 w-3" />
                {totals.local_calls}
              </Badge>
              <Badge variant="outline" className="text-xs">
                <Cloud className="mr-1 h-3 w-3" />
                {totals.cloud_calls}
              </Badge>
            </div>
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-5 pt-0">
          {/* Token totals */}
          <div className="flex gap-6">
            <div>
              <p className={`${ts.small} text-muted-foreground`}>Input tokens</p>
              <p className={`font-medium ${ts.body}`}>
                {formatTokens(totals.total_input_tokens)}
              </p>
            </div>
            <div>
              <p className={`${ts.small} text-muted-foreground`}>Output tokens</p>
              <p className={`font-medium ${ts.body}`}>
                {formatTokens(totals.total_output_tokens)}
              </p>
            </div>
            <div>
              <p className={`${ts.small} text-muted-foreground`}>Total calls</p>
              <p className={`font-medium ${ts.body}`}>{totals.total_calls}</p>
            </div>
          </div>

          {/* Mini daily chart (last 7 days) */}
          {last7.length > 0 && (
            <div>
              <p className={`mb-2 ${ts.small} text-muted-foreground`}>
                Last 7 days
              </p>
              <div className="flex items-end gap-1" style={{ height: 48 }}>
                {last7.map((day) => (
                  <div
                    key={day.date}
                    className="flex flex-1 flex-col items-center gap-1"
                  >
                    <div
                      className="w-full rounded-sm bg-primary/70"
                      style={{
                        height: `${Math.max((day.calls / maxCalls) * 40, 2)}px`,
                      }}
                      title={`${day.date}: ${day.calls} calls, ${formatCost(day.cost_usd)}`}
                    />
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(day.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "narrow" })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* By task breakdown */}
          {by_task.length > 0 && (
            <div>
              <p className={`mb-2 ${ts.small} text-muted-foreground`}>
                By task
              </p>
              <div className="space-y-1">
                {by_task.map((task) => (
                  <div
                    key={task.task_type}
                    className={`flex items-center justify-between ${ts.small}`}
                  >
                    <span className="font-mono">{task.task_type}</span>
                    <span className="text-muted-foreground">
                      {task.calls} calls · {formatTokens(task.input_tokens + task.output_tokens)} tokens
                      {task.cost_usd > 0 && ` · ${formatCost(task.cost_usd)}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
