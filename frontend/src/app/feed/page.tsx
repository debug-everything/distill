"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { toast } from "sonner";
import {
  BookOpen,
  Check,
  ExternalLink,
  Loader2,
  Mail,
  RefreshCw,
  Rss,
  Settings,
  Youtube,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useSettings, textSizeClasses } from "@/lib/settings-store";
import {
  fetchFeedSources,
  fetchFeedItems,
  fetchFeedFetchStatus,
  triggerFeedFetch,
  updateFeedItemStatus,
  captureFeedItem,
  type FeedItem,
  type FeedFetchStatus,
  type FeedSource,
} from "@/lib/api";

const SOURCE_ICONS: Record<string, typeof Rss> = {
  youtube: Youtube,
  rss: Rss,
  newsletter: Mail,
};

const SOURCE_COLORS: Record<string, string> = {
  youtube: "text-red-500",
  rss: "text-orange-500",
  newsletter: "text-blue-500",
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Date grouping ────────────────────────────────────────────────────────────

type DateGroup = { label: string; items: FeedItem[] };

function groupFeedByDate(items: FeedItem[]): DateGroup[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400_000);
  const weekStart = new Date(todayStart.getTime() - 6 * 86400_000);

  const buckets: Record<string, FeedItem[]> = {
    Today: [],
    Yesterday: [],
    "This Week": [],
    Older: [],
  };

  for (const item of items) {
    const d = new Date(item.published_at || item.created_at);
    if (d >= todayStart) buckets["Today"].push(item);
    else if (d >= yesterdayStart) buckets["Yesterday"].push(item);
    else if (d >= weekStart) buckets["This Week"].push(item);
    else buckets["Older"].push(item);
  }

  const sortFn = (a: FeedItem, b: FeedItem) => {
    if (b.topic_match_score !== a.topic_match_score)
      return b.topic_match_score - a.topic_match_score;
    return (
      new Date(b.published_at || b.created_at).getTime() -
      new Date(a.published_at || a.created_at).getTime()
    );
  };

  return Object.entries(buckets)
    .filter(([, arr]) => arr.length > 0)
    .map(([label, arr]) => ({ label, items: arr.sort(sortFn) }));
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function FeedPage() {
  const textSize = useSettings((s) => s.textSize);
  const ts = textSizeClasses[textSize];
  const queryClient = useQueryClient();

  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [fetchPolling, setFetchPolling] = useState(false);

  const sources = useQuery({
    queryKey: ["feedSources"],
    queryFn: fetchFeedSources,
  });

  // Fetch all unread items — filter client-side for accurate sidebar counts
  const feed = useQuery({
    queryKey: ["feedItems"],
    queryFn: () => fetchFeedItems({ status: "unread", limit: 100 }),
  });

  const fetchStatus = useQuery<FeedFetchStatus>({
    queryKey: ["feedFetchStatus"],
    queryFn: fetchFeedFetchStatus,
    refetchInterval: fetchPolling ? 2000 : false,
    enabled: fetchPolling,
  });

  // Stop polling when fetch completes
  const prevProcessing = useRef(false);
  useEffect(() => {
    const isActive = fetchStatus.data?.is_processing ?? false;
    if (prevProcessing.current && !isActive) {
      setFetchPolling(false);
      queryClient.invalidateQueries({ queryKey: ["feedItems"] });
      queryClient.invalidateQueries({ queryKey: ["feedSources"] });
      const result = fetchStatus.data?.last_result;
      if (result?.ok) {
        toast.success(
          `Scanned ${result.sources_scanned} sources — ${result.new_items} new items, ${result.topic_matches} topic matches`,
        );
      } else if (result && !result.ok) {
        toast.error(`Fetch failed: ${result.detail}`);
      }
    }
    prevProcessing.current = isActive;
  }, [fetchStatus.data?.is_processing, fetchStatus.dataUpdatedAt, queryClient]);

  const triggerFetch = useMutation({
    mutationFn: triggerFeedFetch,
    onSuccess: (data) => {
      if (data.ok) {
        setFetchPolling(true);
      } else {
        toast.info(data.detail ?? "Fetch already in progress");
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Optimistically remove item from feed list
  const removeItemOptimistically = (itemId: string) => {
    queryClient.setQueryData(
      ["feedItems"],
      (old: { items: FeedItem[]; has_more: boolean } | undefined) =>
        old ? { ...old, items: old.items.filter((i) => i.id !== itemId) } : old,
    );
  };

  const markDone = useMutation({
    mutationFn: (id: string) => updateFeedItemStatus(id, "archived"),
    onMutate: (id) => removeItemOptimistically(id),
    onError: () => queryClient.invalidateQueries({ queryKey: ["feedItems"] }),
  });

  const capture = useMutation({
    mutationFn: ({ id, mode }: { id: string; mode: "consume_later" | "learn_now" }) =>
      captureFeedItem(id, mode),
    onMutate: ({ id }) => removeItemOptimistically(id),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      toast.success(
        vars.mode === "consume_later"
          ? "Added to digest queue"
          : "Saving to knowledge base",
      );
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["feedItems"] });
      toast.error("Action failed");
    },
  });

  const isFetching = triggerFetch.isPending || fetchStatus.data?.is_processing;
  const sourceList = sources.data ?? [];
  const allItems = feed.data?.items ?? [];

  // Client-side filtering
  const filtered = allItems.filter((item) => {
    if (selectedSource) return item.feed_source_id === selectedSource;
    if (selectedType) return item.source_type === selectedType;
    return true;
  });

  // Sidebar counts
  const typeCounts: Record<string, number> = {};
  const srcCounts: Record<string, number> = {};
  for (const item of allItems) {
    typeCounts[item.source_type] = (typeCounts[item.source_type] || 0) + 1;
    srcCounts[item.feed_source_id] = (srcCounts[item.feed_source_id] || 0) + 1;
  }

  const dateGroups = groupFeedByDate(filtered);
  const matchingCount = filtered.filter((i) => i.topic_match_score > 0).length;

  // No sources configured — empty state
  if (!sources.isLoading && sourceList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Rss className="mb-4 h-12 w-12 text-muted-foreground/40" />
        <h2 className={`mb-2 font-medium ${ts.heading}`}>Set up your feed</h2>
        <p className={`mb-6 max-w-md ${ts.body} text-muted-foreground`}>
          Add YouTube channels, RSS feeds, or blog URLs to get a personalized
          content feed ranked by your focused topics.
        </p>
        <Link href="/settings#feed-sources">
          <Button>
            <Settings className="mr-1.5 h-4 w-4" />
            Set up Feed Sources
          </Button>
        </Link>
        <p className={`mt-4 ${ts.small} text-muted-foreground`}>
          Tip: Set your focused topics in Settings to get topic-matched ranking.
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      {/* ── Left sidebar (desktop only) ── */}
      <aside className="hidden w-52 shrink-0 md:block">
        <div className="sticky top-20 space-y-1">
          {/* All Sources */}
          <button
            type="button"
            className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
              !selectedSource && !selectedType
                ? "bg-secondary font-medium"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
            onClick={() => { setSelectedSource(null); setSelectedType(null); }}
          >
            <span className="flex items-center gap-2">
              <Rss className="h-4 w-4" />
              All Sources
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {allItems.length}
            </span>
          </button>

          <Separator className="my-2" />

          {/* By type */}
          <p className="px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            By Type
          </p>
          {([
            { type: "youtube", label: "YouTube", icon: Youtube, color: "text-red-500" },
            { type: "rss", label: "RSS", icon: Rss, color: "text-orange-500" },
            { type: "newsletter", label: "Newsletters", icon: Mail, color: "text-blue-500" },
          ] as const).map((t) => (
            <button
              key={t.type}
              type="button"
              className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors ${
                selectedType === t.type && !selectedSource
                  ? "bg-secondary font-medium"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
              onClick={() => {
                setSelectedType(selectedType === t.type ? null : t.type);
                setSelectedSource(null);
              }}
            >
              <span className="flex items-center gap-2">
                <t.icon className={`h-3.5 w-3.5 ${t.color}`} />
                {t.label}
              </span>
              {(typeCounts[t.type] ?? 0) > 0 && (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {typeCounts[t.type]}
                </span>
              )}
            </button>
          ))}

          <Separator className="my-2" />

          {/* Individual sources */}
          <p className="px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Sources
          </p>
          {sourceList.map((source) => {
            const Icon = SOURCE_ICONS[source.source_type] ?? Rss;
            return (
              <button
                key={source.id}
                type="button"
                className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors ${
                  selectedSource === source.id
                    ? "bg-secondary font-medium"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
                onClick={() => {
                  setSelectedSource(selectedSource === source.id ? null : source.id);
                  setSelectedType(null);
                }}
              >
                <span className="flex items-center gap-2 truncate">
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{source.name}</span>
                </span>
                {(srcCounts[source.id] ?? 0) > 0 && (
                  <span className="ml-2 text-xs tabular-nums text-muted-foreground">
                    {srcCounts[source.id]}
                  </span>
                )}
              </button>
            );
          })}

          <Separator className="my-2" />

          <Link
            href="/settings#feed-sources"
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          >
            <Settings className="h-3.5 w-3.5" />
            Manage Sources
          </Link>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="min-w-0 flex-1 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className={`font-semibold ${ts.heading}`}>
              {selectedSource
                ? sourceList.find((s) => s.id === selectedSource)?.name ?? "Feed"
                : selectedType
                  ? { youtube: "YouTube", rss: "RSS Feeds", newsletter: "Newsletters" }[selectedType] ?? "Feed"
                  : "Feed"}
            </h1>
            <p className={`${ts.small} text-muted-foreground`}>
              {filtered.length} item{filtered.length !== 1 ? "s" : ""}
              {matchingCount > 0 && ` · ${matchingCount} matching your topics`}
              {sourceList.some((s) => s.last_fetched) && (
                <>
                  {" · Last fetched "}
                  {timeAgo(
                    sourceList
                      .filter((s): s is FeedSource & { last_fetched: string } => !!s.last_fetched)
                      .sort((a, b) => new Date(b.last_fetched).getTime() - new Date(a.last_fetched).getTime())[0]
                      ?.last_fetched ?? "",
                  )}
                </>
              )}
            </p>
          </div>
          <Button onClick={() => triggerFetch.mutate()} disabled={!!isFetching}>
            {isFetching ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-4 w-4" />
            )}
            Fetch Feed
          </Button>
        </div>

        {/* Mobile filter pills (hidden on desktop where sidebar shows) */}
        <div className="flex flex-wrap gap-2 md:hidden">
          <Button
            variant={!selectedType && !selectedSource ? "secondary" : "outline"}
            size="sm"
            onClick={() => { setSelectedType(null); setSelectedSource(null); }}
          >
            All
          </Button>
          {([
            { value: "youtube", label: "YouTube", icon: Youtube, color: "text-red-500" },
            { value: "rss", label: "RSS", icon: Rss, color: "text-orange-500" },
            { value: "newsletter", label: "Newsletter", icon: Mail, color: "text-blue-500" },
          ] as const).map((f) => (
            <Button
              key={f.value}
              variant={selectedType === f.value ? "secondary" : "outline"}
              size="sm"
              className="gap-1.5"
              onClick={() => { setSelectedType(selectedType === f.value ? null : f.value); setSelectedSource(null); }}
            >
              <f.icon className={`h-3.5 w-3.5 ${f.color}`} />
              {f.label}
            </Button>
          ))}
        </div>

        {/* Fetch progress */}
        {fetchStatus.data?.is_processing && (
          <Card>
            <CardContent className="py-4">
              <p className={`mb-2 ${ts.small}`}>{fetchStatus.data.stage}</p>
              {fetchStatus.data.total > 0 && (
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{
                      width: `${(fetchStatus.data.current / fetchStatus.data.total) * 100}%`,
                    }}
                  />
                </div>
              )}
              {fetchStatus.data.source_progress.length > 0 && (
                <div className="mt-3 space-y-1">
                  {fetchStatus.data.source_progress.map((sp, i) => (
                    <div key={i} className={`flex items-center justify-between ${ts.small}`}>
                      <span>{sp.name}</span>
                      <span className="text-muted-foreground">
                        {sp.status === "done"
                          ? `${sp.new_items} new`
                          : sp.status === "error"
                            ? "error"
                            : "..."}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Loading skeleton */}
        {feed.isLoading && (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-md" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!feed.isLoading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Check className="mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className={`${ts.body} text-muted-foreground`}>
              {allItems.length > 0
                ? "No items matching this filter"
                : sourceList.some((s) => s.last_fetched)
                  ? "All caught up!"
                  : "Click Fetch Feed to scan your sources"}
            </p>
          </div>
        )}

        {/* Date-grouped feed items */}
        {dateGroups.map((group) => (
          <section key={group.label}>
            <div className="sticky top-0 z-10 -mx-1 mb-3 flex items-center gap-3 bg-background/95 px-1 py-2 backdrop-blur-sm">
              <h2 className={`shrink-0 font-semibold ${ts.body}`}>{group.label}</h2>
              <Separator className="flex-1" />
              <span className="text-xs tabular-nums text-muted-foreground">
                {group.items.length}
              </span>
            </div>
            <div className="space-y-2">
              {group.items.map((item) => (
                <FeedItemCard
                  key={item.id}
                  item={item}
                  onDone={() => markDone.mutate(item.id)}
                  onCapture={(mode) => capture.mutate({ id: item.id, mode })}
                  ts={ts}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

// ── Feed item card ───────────────────────────────────────────────────────────

function FeedItemCard({
  item,
  onDone,
  onCapture,
  ts,
}: {
  item: FeedItem;
  onDone: () => void;
  onCapture: (mode: "consume_later" | "learn_now") => void;
  ts: { body: string; small: string; heading: string };
}) {
  const Icon = SOURCE_ICONS[item.source_type] ?? Rss;
  const iconColor = SOURCE_COLORS[item.source_type] ?? "text-muted-foreground";
  const isMatched = item.topic_match_score > 0;

  return (
    <Card className={isMatched ? "border-l-2 border-l-primary/40" : ""}>
      <CardContent className="space-y-2 py-3">
        {/* Row 1: source info + time */}
        <div className="flex items-center gap-2">
          <Icon className={`h-3.5 w-3.5 shrink-0 ${iconColor}`} />
          <span className={`${ts.small} text-muted-foreground`}>
            {item.source_name}
          </span>
          <Badge variant="outline" className="text-xs">
            {item.source_type}
          </Badge>
          {item.published_at && (
            <span className={`ml-auto ${ts.small} text-muted-foreground`}>
              {timeAgo(item.published_at)}
            </span>
          )}
        </div>

        {/* Title + topic badges */}
        <div>
          <p className={`font-medium ${ts.body}`}>{item.title}</p>
          {item.topic_tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {item.topic_tags.map((tag) => (
                <Badge
                  key={tag}
                  variant={isMatched ? "default" : "outline"}
                  className="text-xs"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Description snippet */}
        {item.content && (
          <p className={`line-clamp-2 ${ts.small} text-muted-foreground`}>
            {stripHtml(item.content).slice(0, 200)}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onDone}>
            <Check className="mr-1 h-3.5 w-3.5" />
            Done
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onCapture("consume_later")}
          >
            <BookOpen className="mr-1 h-3.5 w-3.5" />
            Add to Digest
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onCapture("learn_now")}
          >
            <Zap className="mr-1 h-3.5 w-3.5" />
            Save to KB
          </Button>
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
