"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  Rss,
  Search,
  Trash2,
  Youtube,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useSettings, textSizeClasses } from "@/lib/settings-store";
import { FocusedTopics } from "@/components/focused-topics";
import { StatsCard } from "@/components/stats-card";
import {
  fetchFeedSources,
  createFeedSource,
  deleteFeedSource,
  detectFeedSource,
  type FeedSource,
  type SourceDetectResult,
} from "@/lib/api";

const SOURCE_TYPE_META: Record<
  string,
  { icon: typeof Rss; label: string; color: string }
> = {
  youtube: {
    icon: Youtube,
    label: "YouTube",
    color: "text-red-500",
  },
  rss: {
    icon: Rss,
    label: "RSS",
    color: "text-orange-500",
  },
  newsletter: {
    icon: Mail,
    label: "Newsletter",
    color: "text-blue-500",
  },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function SettingsPage() {
  const textSize = useSettings((s) => s.textSize);
  const ts = textSizeClasses[textSize];

  return (
    <div className="space-y-10">
      <h1 className={`font-semibold ${ts.heading}`}>Settings</h1>

      {/* Feed Sources */}
      <section id="feed-sources">
        <FeedSourcesSection />
      </section>

      <Separator />

      {/* Focused Topics */}
      <section id="focused-topics">
        <FocusedTopics />
      </section>

      <Separator />

      {/* LLM Usage */}
      <section id="stats">
        <StatsCard />
      </section>
    </div>
  );
}

function FeedSourcesSection() {
  const textSize = useSettings((s) => s.textSize);
  const ts = textSizeClasses[textSize];
  const queryClient = useQueryClient();

  const [sourceUrl, setSourceUrl] = useState("");
  const [detected, setDetected] = useState<SourceDetectResult | null>(null);

  const sources = useQuery({
    queryKey: ["feedSources"],
    queryFn: fetchFeedSources,
  });

  const detect = useMutation({
    mutationFn: detectFeedSource,
    onSuccess: (result) => {
      setDetected(result);
    },
    onError: (err: Error) => {
      toast.error(err.message);
      setDetected(null);
    },
  });

  const addSource = useMutation({
    mutationFn: createFeedSource,
    onSuccess: (source) => {
      queryClient.invalidateQueries({ queryKey: ["feedSources"] });
      toast.success(`Added "${source.name}"`);
      setSourceUrl("");
      setDetected(null);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const removeSource = useMutation({
    mutationFn: deleteFeedSource,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feedSources"] });
      toast.success("Source removed");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const handleDetect = () => {
    const url = sourceUrl.trim();
    if (!url) return;
    setDetected(null);
    detect.mutate(url);
  };

  const handleAdd = () => {
    if (!detected) return;
    addSource.mutate({
      source_type: detected.source_type,
      name: detected.name,
      url: detected.feed_url,
    });
  };

  const sourceList = sources.data ?? [];

  return (
    <>
      <h2 className={`mb-3 font-medium ${ts.heading}`}>Feed Sources</h2>
      <p className={`mb-4 ${ts.small} text-muted-foreground`}>
        Add YouTube channels, RSS feeds, or blog URLs. Sources are scanned when
        you fetch your feed.
      </p>

      {/* Add source input */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Paste a YouTube channel or RSS feed URL…"
          value={sourceUrl}
          onChange={(e) => {
            setSourceUrl(e.target.value);
            if (detected) setDetected(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleDetect();
            }
          }}
          className={`flex-1 rounded-md border border-input bg-background px-3 py-1.5 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${ts.body}`}
        />
        <Button
          variant="outline"
          onClick={handleDetect}
          disabled={!sourceUrl.trim() || detect.isPending}
        >
          {detect.isPending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Search className="mr-1.5 h-4 w-4" />
          )}
          Detect
        </Button>
      </div>

      {/* Detection result card */}
      {detected && (
        <Card className="mt-3">
          <CardContent className="flex items-center gap-3 py-3">
            {(() => {
              const meta = SOURCE_TYPE_META[detected.source_type] ?? SOURCE_TYPE_META.rss;
              const Icon = meta.icon;
              return <Icon className={`h-5 w-5 shrink-0 ${meta.color}`} />;
            })()}
            <div className="min-w-0 flex-1">
              <p className={`font-medium ${ts.body}`}>{detected.name}</p>
              <p className={`truncate ${ts.small} text-muted-foreground`}>
                {detected.feed_url}
              </p>
            </div>
            <Badge variant="outline" className="shrink-0">
              {SOURCE_TYPE_META[detected.source_type]?.label ?? detected.source_type}
            </Badge>
            <Button size="sm" onClick={handleAdd} disabled={addSource.isPending}>
              {addSource.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-1.5 h-4 w-4" />
              )}
              Add
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Source list */}
      {sources.isLoading && (
        <div className="mt-4 space-y-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-md" />
          ))}
        </div>
      )}

      {sourceList.length > 0 && (
        <div className="mt-4 rounded-md border divide-y">
          {sourceList.map((source) => {
            const meta = SOURCE_TYPE_META[source.source_type] ?? SOURCE_TYPE_META.rss;
            const Icon = meta.icon;
            return (
              <div
                key={source.id}
                className="flex items-center gap-3 px-4 py-3"
              >
                <Icon className={`h-4 w-4 shrink-0 ${meta.color}`} />
                <div className="min-w-0 flex-1">
                  <p className={`font-medium ${ts.small}`}>{source.name}</p>
                  <p className={`text-xs text-muted-foreground truncate`}>
                    {source.item_count} items
                    {source.last_fetched &&
                      ` · Last fetched ${timeAgo(source.last_fetched)}`}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs shrink-0">
                  {meta.label}
                </Badge>
                <button
                  type="button"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeSource.mutate(source.id)}
                  disabled={removeSource.isPending}
                  title="Remove source"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {!sources.isLoading && sourceList.length === 0 && !detected && (
        <div className="mt-4 flex flex-col items-center justify-center rounded-md border border-dashed py-8 text-center">
          <Rss className="mb-2 h-8 w-8 text-muted-foreground/50" />
          <p className={`${ts.body} text-muted-foreground`}>
            No feed sources yet
          </p>
          <p className={`${ts.small} text-muted-foreground`}>
            Paste a URL above and click Detect to get started
          </p>
        </div>
      )}
    </>
  );
}
