"use client";

import { useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Flame,
  LayoutGrid,
  LayoutList,
  Layers,
  List,
  Loader2,
  Rows3,
  ScanLine,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useSettings,
  textSizeClasses,
  readingFontClasses,
  lineSpacingClasses,
  type TileFormat,
  type TileLayout,
} from "@/lib/settings-store";
import {
  fetchDigest,
  fetchFocusedTopics,
  markClusterDone,
  promoteCluster,
  unpackCluster,
  type DigestCluster,
  type UnpackSection,
} from "@/lib/api";

const SUMMARY_CHAR_LIMIT = 200;

function formatDate(dateStr: string) {
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  if (dateStr === today) return "Today";
  if (dateStr === yesterday) return "Yesterday";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function clampText(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit).trimEnd() + "…";
}

function getClusterImage(cluster: DigestCluster): string | null {
  for (const source of cluster.sources) {
    if (source.image_url) return source.image_url;
  }
  return null;
}

function hasVideoSource(cluster: DigestCluster): boolean {
  return cluster.sources.some((s) => s.content_type === "video");
}

function getVideoSourceUrl(cluster: DigestCluster): string | null {
  const videoSource = cluster.sources.find((s) => s.content_type === "video");
  return videoSource?.source_url ?? null;
}

function timestampToSeconds(ts: string): number {
  const parts = ts.split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function hasAutoTranscript(cluster: DigestCluster): boolean {
  return cluster.sources.some((s) => s.extraction_quality === "auto-transcript");
}

function hasPaywall(cluster: DigestCluster): boolean {
  return cluster.sources.some((s) => s.extraction_quality === "low");
}

const STYLE_LABELS: Record<string, string> = {
  tutorial: "Tutorial",
  demo: "Demo",
  opinion: "Opinion",
  interview: "Interview",
  news: "News",
  analysis: "Analysis",
  narrative: "Narrative",
  review: "Review",
};

function ContentBadges({ cluster }: { cluster: DigestCluster }) {
  const style = cluster.content_style;
  const density = cluster.information_density;
  const attrs = cluster.content_attributes;
  const hasDemoCues = attrs?.has_demo_cues === true;

  return (
    <>
      {style && STYLE_LABELS[style] && (
        <Badge variant="outline" className="shrink-0 text-xs">
          {STYLE_LABELS[style]}
        </Badge>
      )}
      {density != null && density >= 7 && (
        <Badge variant="outline" className="shrink-0 border-orange-300 text-xs text-orange-600">
          <Flame className="mr-1 h-3 w-3" />
          Dense ({density}/10)
        </Badge>
      )}
      {hasDemoCues && (
        <Badge variant="outline" className="shrink-0 border-blue-300 text-xs text-blue-600">
          Screen demo
        </Badge>
      )}
    </>
  );
}

/** Group clusters by digest_date, preserving order. */
function groupByDate(clusters: DigestCluster[]): { date: string; clusters: DigestCluster[] }[] {
  const groups: { date: string; clusters: DigestCluster[] }[] = [];
  for (const cluster of clusters) {
    const last = groups[groups.length - 1];
    if (last && last.date === cluster.digest_date) {
      last.clusters.push(cluster);
    } else {
      groups.push({ date: cluster.digest_date, clusters: [cluster] });
    }
  }
  return groups;
}

// ----- Tile components per format -----

function DefaultTile({
  cluster,
  onClick,
  onDone,
  ts,
  focusedSet,
}: {
  cluster: DigestCluster;
  onClick: () => void;
  onDone: () => void;
  ts: { body: string; small: string; heading: string };
  focusedSet: Set<string>;
}) {
  const imageUrl = getClusterImage(cluster);

  return (
    <Card
      className={`cursor-pointer transition-colors hover:bg-muted/50 ${cluster.is_merged ? "border-2" : ""}`}
      onClick={onClick}
    >
      <div className="flex">
        <div className="min-w-0 flex-1">
          <CardHeader className="pb-2">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              {cluster.is_merged && (
                <Badge variant="secondary" className="shrink-0">
                  <Layers className="mr-1 h-3 w-3" />
                  {cluster.source_count} sources
                </Badge>
              )}
              {cluster.topic_tags.map((tag) => (
                <Badge key={tag} variant={focusedSet.has(tag) ? "default" : "outline"} className="shrink-0">
                  {tag}
                </Badge>
              ))}
              {hasVideoSource(cluster) && (
                <Badge variant="outline" className="shrink-0">
                  <Video className="mr-1 h-3 w-3" />
                  Video
                </Badge>
              )}
              {hasAutoTranscript(cluster) && (
                <Badge variant="outline" className="shrink-0 border-amber-300 text-amber-600">
                  Auto-transcript
                </Badge>
              )}
              {hasPaywall(cluster) && (
                <Badge variant="outline" className="shrink-0 border-amber-300 text-amber-600">
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  Paywall
                </Badge>
              )}
              <ContentBadges cluster={cluster} />
            </div>
            <CardTitle className={ts.heading}>{cluster.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`mb-3 ${ts.body} leading-relaxed text-muted-foreground`}>
              {clampText(cluster.summary || cluster.headline, SUMMARY_CHAR_LIMIT)}
            </p>
            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="sm" onClick={onDone}>
                <Check className="mr-1.5 h-4 w-4" />
                Done
              </Button>
            </div>
          </CardContent>
        </div>
        {imageUrl && (
          <div className="hidden shrink-0 p-4 sm:block">
            <img
              src={imageUrl}
              alt=""
              className="h-28 w-40 rounded-md object-cover"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        )}
      </div>
    </Card>
  );
}

function CompactTile({
  cluster,
  onClick,
  onDone,
  ts,
  focusedSet,
}: {
  cluster: DigestCluster;
  onClick: () => void;
  onDone: () => void;
  ts: { body: string; small: string; heading: string };
  focusedSet: Set<string>;
}) {
  const imageUrl = getClusterImage(cluster);

  return (
    <Card
      className={`cursor-pointer transition-colors hover:bg-muted/50 ${cluster.is_merged ? "border-2" : ""}`}
      onClick={onClick}
    >
      <CardContent className="flex items-center gap-4 py-3">
        {imageUrl && (
          <img
            src={imageUrl}
            alt=""
            className="hidden h-14 w-20 shrink-0 rounded object-cover sm:block"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            {cluster.topic_tags.map((tag) => (
              <Badge key={tag} variant={focusedSet.has(tag) ? "default" : "outline"} className="shrink-0 text-xs">
                {tag}
              </Badge>
            ))}
            {cluster.is_merged && (
              <Badge variant="secondary" className="shrink-0 text-xs">
                {cluster.source_count} sources
              </Badge>
            )}
            {hasVideoSource(cluster) && (
              <Badge variant="outline" className="shrink-0 text-xs">
                <Video className="mr-1 h-3 w-3" />
                Video
              </Badge>
            )}
            {hasAutoTranscript(cluster) && (
              <Badge variant="outline" className="shrink-0 border-amber-300 text-xs text-amber-600">
                Auto-transcript
              </Badge>
            )}
            {hasPaywall(cluster) && (
              <Badge variant="outline" className="shrink-0 border-amber-300 text-xs text-amber-600">
                <AlertTriangle className="mr-1 h-3 w-3" />
                Paywall
              </Badge>
            )}
            <ContentBadges cluster={cluster} />
          </div>
          <p className={`font-medium leading-snug ${ts.body}`}>{cluster.title}</p>
        </div>
        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDone}>
            <Check className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MinimalTile({
  cluster,
  onClick,
  onDone,
  ts,
  focusedSet,
}: {
  cluster: DigestCluster;
  onClick: () => void;
  onDone: () => void;
  ts: { body: string; small: string; heading: string };
  focusedSet: Set<string>;
}) {
  return (
    <Card
      className={`cursor-pointer transition-colors hover:bg-muted/50 ${cluster.is_merged ? "border-2" : ""}`}
      onClick={onClick}
    >
      <CardContent className="flex items-center gap-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            {cluster.topic_tags.map((tag) => (
              <Badge key={tag} variant={focusedSet.has(tag) ? "default" : "outline"} className="shrink-0 text-xs">
                {tag}
              </Badge>
            ))}
            {cluster.is_merged && (
              <Badge variant="secondary" className="shrink-0 text-xs">
                {cluster.source_count} sources
              </Badge>
            )}
            {hasVideoSource(cluster) && (
              <Badge variant="outline" className="shrink-0 text-xs">
                <Video className="mr-1 h-3 w-3" />
                Video
              </Badge>
            )}
            {hasAutoTranscript(cluster) && (
              <Badge variant="outline" className="shrink-0 border-amber-300 text-xs text-amber-600">
                Auto-transcript
              </Badge>
            )}
            {hasPaywall(cluster) && (
              <Badge variant="outline" className="shrink-0 border-amber-300 text-xs text-amber-600">
                <AlertTriangle className="mr-1 h-3 w-3" />
                Paywall
              </Badge>
            )}
            <ContentBadges cluster={cluster} />
          </div>
          <p className={`font-medium leading-snug ${ts.body}`}>{cluster.title}</p>
        </div>
        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDone}>
            <Check className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ----- Format/layout toggle bar -----

const FORMAT_OPTIONS: { value: TileFormat; icon: typeof Rows3; label: string }[] = [
  { value: "default", icon: Rows3, label: "Default" },
  { value: "compact", icon: List, label: "Compact" },
  { value: "minimal", icon: ScanLine, label: "Minimal" },
];

const LAYOUT_OPTIONS: { value: TileLayout; icon: typeof LayoutList; label: string }[] = [
  { value: "vertical", icon: LayoutList, label: "List" },
  { value: "grid", icon: LayoutGrid, label: "Grid" },
];

// ----- Main page -----

export default function DigestPage() {
  const [selectedCluster, setSelectedCluster] = useState<DigestCluster | null>(null);
  const [unpackedView, setUnpackedView] = useState(false);
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const textSize = useSettings((s) => s.textSize);
  const tileFormat = useSettings((s) => s.tileFormat);
  const tileLayout = useSettings((s) => s.tileLayout);
  const readingFont = useSettings((s) => s.readingFont);
  const lineSpacing = useSettings((s) => s.lineSpacing);
  const setTileFormat = useSettings((s) => s.setTileFormat);
  const setTileLayout = useSettings((s) => s.setTileLayout);
  const ts = textSizeClasses[textSize];
  const rf = readingFontClasses[readingFont];
  const ls = lineSpacingClasses[lineSpacing];

  const focusedTopics = useQuery({
    queryKey: ["focusedTopics"],
    queryFn: fetchFocusedTopics,
  });
  const focusedSet = new Set(focusedTopics.data?.topics ?? []);

  const digest = useInfiniteQuery({
    queryKey: ["digest"],
    queryFn: ({ pageParam }) => fetchDigest(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      if (!lastPage.has_more || lastPage.clusters.length === 0) return undefined;
      // Use the oldest date in this page as cursor for the next
      const oldestDate = lastPage.clusters[lastPage.clusters.length - 1].digest_date;
      return oldestDate;
    },
  });

  const done = useMutation({
    mutationFn: markClusterDone,
    onMutate: async (clusterId) => {
      // Cancel in-flight fetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ["digest"] });

      const previous = queryClient.getQueryData(["digest"]);

      // Optimistically mark cluster as done (filtered out by visibleClusters)
      queryClient.setQueryData<typeof digest.data>(["digest"], (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            clusters: page.clusters.map((c) =>
              c.id === clusterId ? { ...c, status: "done" } : c
            ),
          })),
        };
      });

      setSelectedCluster(null);
      return { previous };
    },
    onError: (_err, _id, context) => {
      // Roll back on failure
      if (context?.previous) {
        queryClient.setQueryData(["digest"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["digest"] });
    },
  });

  const promote = useMutation({
    mutationFn: promoteCluster,
    onSuccess: (data, clusterId) => {
      setSelectedCluster((prev) =>
        prev && prev.id === clusterId ? { ...prev, status: "promoted" } : prev
      );
      queryClient.invalidateQueries({ queryKey: ["digest"] });
      queryClient.invalidateQueries({ queryKey: ["kb"] });
      toast.success(`Saved to knowledge base (${data.indexed} article${data.indexed !== 1 ? "s" : ""} indexed)`);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const unpack = useMutation({
    mutationFn: unpackCluster,
    onSuccess: (data, clusterId) => {
      setUnpackedView(true);
      // Update the cluster in query cache so sections are cached client-side
      queryClient.setQueryData<typeof digest.data>(["digest"], (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            clusters: page.clusters.map((c) =>
              c.id === clusterId ? { ...c, unpacked_sections: data.sections } : c
            ),
          })),
        };
      });
      // Also update the selected cluster in local state
      setSelectedCluster((prev) =>
        prev && prev.id === clusterId ? { ...prev, unpacked_sections: data.sections } : prev
      );
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  // Flatten all pages into a single cluster list
  const allClusters = digest.data?.pages.flatMap((p) => p.clusters) ?? [];

  const allTopics = Array.from(
    new Set(
      allClusters
        .filter((c) => c.status !== "done")
        .flatMap((c) => c.topic_tags)
    )
  ).sort();

  const visibleClusters = allClusters.filter((c) => {
    if (c.status === "done") return false;
    if (activeTopic && !c.topic_tags.includes(activeTopic)) return false;
    return true;
  });

  // Sort clusters within each date group: focused topic matches + information density
  const dateGroups = groupByDate(visibleClusters).map((group) => {
    const sorted = [...group.clusters].sort((a, b) => {
      // Primary: focused topic match count
      const aTopicScore = a.topic_tags.filter((t) => focusedSet.has(t)).length;
      const bTopicScore = b.topic_tags.filter((t) => focusedSet.has(t)).length;
      if (aTopicScore !== bTopicScore) return bTopicScore - aTopicScore;
      // Secondary: information density (higher = more interesting)
      const aDensity = a.information_density ?? 0;
      const bDensity = b.information_density ?? 0;
      return bDensity - aDensity;
    });
    return { ...group, clusters: sorted };
  });

  const TileComponent =
    tileFormat === "compact"
      ? CompactTile
      : tileFormat === "minimal"
        ? MinimalTile
        : DefaultTile;

  const useGrid = tileLayout === "grid";
  const containerClass = useGrid
    ? "grid gap-3 grid-cols-1 sm:grid-cols-2"
    : "flex flex-col gap-3";

  return (
    <div className="min-h-screen">
      {/* Header + display controls */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Digest</h1>

        <div className="flex items-center gap-1">
          {FORMAT_OPTIONS.map(({ value, icon: Icon, label }) => (
            <Button
              key={value}
              variant={tileFormat === value ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() => setTileFormat(value)}
              title={label}
            >
              <Icon className="h-4 w-4" />
            </Button>
          ))}

          <Separator orientation="vertical" className="mx-1 h-5" />

          <div className="hidden sm:flex sm:items-center sm:gap-1">
            {LAYOUT_OPTIONS.map(({ value, icon: Icon, label }) => (
              <Button
                key={value}
                variant={tileLayout === value ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8"
                onClick={() => setTileLayout(value)}
                title={label}
              >
                <Icon className="h-4 w-4" />
              </Button>
            ))}
          </div>

          <span className={`ml-2 ${ts.small} text-muted-foreground`}>
            {visibleClusters.length} unread
          </span>
        </div>
      </div>

      {/* Topic filters */}
      {allTopics.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <Badge
            variant={activeTopic === null ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setActiveTopic(null)}
          >
            All ({visibleClusters.length})
          </Badge>
          {allTopics.map((topic) => (
            <Badge
              key={topic}
              variant={activeTopic === topic ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() =>
                setActiveTopic(activeTopic === topic ? null : topic)
              }
            >
              {topic}
            </Badge>
          ))}
        </div>
      )}

      {/* Loading */}
      {digest.isLoading && (
        <p className={`${ts.body} text-muted-foreground`}>Loading digest...</p>
      )}

      {/* Empty state — differentiate "all caught up" vs "truly empty" */}
      {dateGroups.length === 0 && !digest.isLoading && allClusters.length > 0 && (
        <p className={`${ts.body} text-muted-foreground`}>
          All caught up! Every cluster has been marked done.
        </p>
      )}
      {dateGroups.length === 0 && !digest.isLoading && allClusters.length === 0 && (
        <p className={`${ts.body} text-muted-foreground`}>
          No digest yet.{" "}
          <Link href="/" className="underline">
            Add articles
          </Link>{" "}
          and generate a digest to see clusters here.
        </p>
      )}

      {/* Clusters grouped by date */}
      <div className="space-y-8">
        {dateGroups.map((group) => (
          <section key={group.date}>
            <h2 className={`mb-3 font-semibold ${ts.body} text-muted-foreground`}>
              {formatDate(group.date)}
            </h2>
            <div className={containerClass}>
              {group.clusters.map((cluster) => (
                <TileComponent
                  key={cluster.id}
                  cluster={cluster}
                  onClick={() => { setSelectedCluster(cluster); setUnpackedView(false); }}
                  onDone={() => done.mutate(cluster.id)}
                  ts={ts}
                  focusedSet={focusedSet}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Load More */}
      {digest.hasNextPage && (
        <div className="mt-8 flex justify-center">
          <Button
            variant="outline"
            onClick={() => digest.fetchNextPage()}
            disabled={digest.isFetchingNextPage}
          >
            {digest.isFetchingNextPage ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : null}
            Load More
          </Button>
        </div>
      )}

      {/* Reading modal */}
      <Dialog
        open={!!selectedCluster}
        onOpenChange={(open) => !open && setSelectedCluster(null)}
      >
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto p-6 sm:p-8">
          {selectedCluster && (() => {
            const currentIdx = visibleClusters.findIndex((c) => c.id === selectedCluster.id);
            const prevCluster = currentIdx > 0 ? visibleClusters[currentIdx - 1] : null;
            const nextCluster = currentIdx < visibleClusters.length - 1 ? visibleClusters[currentIdx + 1] : null;
            return (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between gap-2">
                  <DialogTitle className={`${ts.heading} leading-snug`}>
                    {selectedCluster.title}
                  </DialogTitle>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={!prevCluster}
                      onClick={() => { if (prevCluster) { setSelectedCluster(prevCluster); setUnpackedView(false); } }}
                      title="Previous"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className={`${ts.small} text-muted-foreground tabular-nums`}>
                      {currentIdx >= 0 ? currentIdx + 1 : "?"}/{visibleClusters.length}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={!nextCluster}
                      onClick={() => { if (nextCluster) { setSelectedCluster(nextCluster); setUnpackedView(false); } }}
                      title="Next"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {selectedCluster.is_merged && (
                    <Badge variant="secondary">
                      {selectedCluster.source_count} sources
                    </Badge>
                  )}
                  {selectedCluster.topic_tags.map((tag) => (
                    <Badge key={tag} variant={focusedSet.has(tag) ? "default" : "outline"}>
                      {tag}
                    </Badge>
                  ))}
                  <ContentBadges cluster={selectedCluster} />
                </div>
              </DialogHeader>

              <Tabs defaultValue="summary" className="mt-4">
                <TabsList className="w-full">
                  <TabsTrigger value="summary" className="flex-1">
                    Summary
                  </TabsTrigger>
                  <TabsTrigger value="quotes" className="flex-1">
                    Quotes
                  </TabsTrigger>
                  <TabsTrigger value="sources" className="flex-1">
                    Sources ({selectedCluster.sources.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="summary" className={`mt-5 space-y-4 ${rf}`}>
                  {!unpackedView ? (
                    <>
                      <p className={`${ts.body} ${ls}`}>
                        {selectedCluster.summary}
                      </p>
                      {selectedCluster.bullets.length > 0 && (
                        <>
                          <Separator />
                          <ul className="space-y-3">
                            {selectedCluster.bullets.map((bullet, i) => (
                              <li
                                key={i}
                                className={`flex gap-2.5 ${ts.body} ${ls}`}
                              >
                                <span className="mt-0.5 text-muted-foreground">•</span>
                                <span>{bullet}</span>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <button
                        className={`${ts.small} text-muted-foreground hover:text-foreground underline`}
                        onClick={() => setUnpackedView(false)}
                      >
                        Show quick summary
                      </button>
                      {unpack.isPending ? (
                        <div className="space-y-5">
                          {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="space-y-2">
                              <Skeleton className="h-5 w-2/5" />
                              <Skeleton className="h-4 w-full" />
                              <Skeleton className="h-4 w-4/5" />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-5">
                          {(() => {
                            const videoUrl = getVideoSourceUrl(selectedCluster);
                            return selectedCluster.unpacked_sections?.map((section, i) => (
                              <div key={i}>
                                <div className="flex items-center gap-2">
                                  <h4 className={`font-semibold ${ts.body} ${ls}`}>{section.title}</h4>
                                  {section.timestamp && videoUrl && (
                                    <a
                                      href={`${videoUrl}${videoUrl.includes("?") ? "&" : "?"}t=${timestampToSeconds(section.timestamp)}s`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={`shrink-0 ${ts.small} text-muted-foreground hover:text-foreground`}
                                    >
                                      ▶ {section.timestamp}
                                    </a>
                                  )}
                                </div>
                                <p className={`mt-1 ${ts.body} ${ls} text-muted-foreground`}>{section.content}</p>
                              </div>
                            ));
                          })()}
                        </div>
                      )}
                    </>
                  )}
                </TabsContent>

                <TabsContent value="quotes" className={`mt-5 space-y-4 ${rf}`}>
                  {selectedCluster.quotes.length === 0 && (
                    <p className={`${ts.body} text-muted-foreground`}>
                      No quotes extracted.
                    </p>
                  )}
                  {selectedCluster.quotes.map((quote, i) => (
                    <blockquote
                      key={i}
                      className={`border-l-2 pl-5 ${ts.body} italic ${ls} text-muted-foreground`}
                    >
                      &ldquo;{quote}&rdquo;
                    </blockquote>
                  ))}
                </TabsContent>

                <TabsContent value="sources" className="mt-5 space-y-3">
                  {selectedCluster.sources.map((source) => (
                    <div
                      key={source.article_id}
                      className="flex items-center justify-between rounded-md border p-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className={`font-medium ${ts.body}`}>
                            {source.source_name || "Unknown"}
                          </p>
                          {source.content_type === "video" && (
                            <Badge variant="outline" className="shrink-0 text-xs">
                              <Video className="mr-1 h-3 w-3" />
                              Video
                            </Badge>
                          )}
                          {source.extraction_quality === "auto-transcript" && (
                            <Badge variant="outline" className="shrink-0 border-amber-300 text-xs text-amber-600">
                              Auto-transcript
                            </Badge>
                          )}
                          {source.extraction_quality === "low" && (
                            <Badge variant="outline" className="shrink-0 border-amber-300 text-xs text-amber-600">
                              <AlertTriangle className="mr-1 h-3 w-3" />
                              Paywall
                            </Badge>
                          )}
                        </div>
                        <p className={`truncate ${ts.small} text-muted-foreground`}>
                          {source.source_url}
                        </p>
                      </div>
                      <a
                        href={source.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-3 shrink-0 text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  ))}
                </TabsContent>
              </Tabs>

              <Separator className="my-4" />

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={selectedCluster.sources.every((s) => s.extraction_quality === "low")}
                  onClick={() => {
                    if (selectedCluster.unpacked_sections) {
                      setUnpackedView(true);
                    } else {
                      setUnpackedView(true);
                      unpack.mutate(selectedCluster.id);
                    }
                  }}
                  title={
                    selectedCluster.sources.every((s) => s.extraction_quality === "low")
                      ? "Cannot unpack — all sources are behind a paywall"
                      : undefined
                  }
                >
                  <Layers className="mr-1.5 h-4 w-4" />
                  Unpack
                </Button>
                <Button
                  variant="outline"
                  onClick={() => promote.mutate(selectedCluster.id)}
                  disabled={promote.isPending || selectedCluster.status === "promoted"}
                >
                  {promote.isPending ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <BookOpen className="mr-1.5 h-4 w-4" />
                  )}
                  {selectedCluster.status === "promoted" ? "Saved to KB" : "Save to Knowledge Base"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => done.mutate(selectedCluster.id)}
                >
                  <Check className="mr-1.5 h-4 w-4" />
                  Done
                </Button>
              </div>
              {/* Promote feedback handled via toasts */}
            </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
