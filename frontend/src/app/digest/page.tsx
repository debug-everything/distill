"use client";

import { useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  AlertTriangle,
  BookOpen,
  Check,
  ExternalLink,
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
  markClusterDone,
  promoteCluster,
  type DigestCluster,
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

function hasAutoTranscript(cluster: DigestCluster): boolean {
  return cluster.sources.some((s) => s.extraction_quality === "auto-transcript");
}

function hasPaywall(cluster: DigestCluster): boolean {
  return cluster.sources.some((s) => s.extraction_quality === "low");
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
}: {
  cluster: DigestCluster;
  onClick: () => void;
  onDone: () => void;
  ts: { body: string; small: string; heading: string };
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
                <Badge key={tag} variant="outline" className="shrink-0">
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
}: {
  cluster: DigestCluster;
  onClick: () => void;
  onDone: () => void;
  ts: { body: string; small: string; heading: string };
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
              <Badge key={tag} variant="outline" className="shrink-0 text-xs">
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
}: {
  cluster: DigestCluster;
  onClick: () => void;
  onDone: () => void;
  ts: { body: string; small: string; heading: string };
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
              <Badge key={tag} variant="outline" className="shrink-0 text-xs">
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["digest"] });
      setSelectedCluster(null);
    },
  });

  const promote = useMutation({
    mutationFn: promoteCluster,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["digest"] });
      queryClient.invalidateQueries({ queryKey: ["kb"] });
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

  const dateGroups = groupByDate(visibleClusters);

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

      {/* Empty state */}
      {dateGroups.length === 0 && !digest.isLoading && (
        <p className={`${ts.body} text-muted-foreground`}>
          No digest clusters yet.{" "}
          <Link href="/" className="underline">
            Add articles
          </Link>{" "}
          and process them.
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
                  onClick={() => setSelectedCluster(cluster)}
                  onDone={() => done.mutate(cluster.id)}
                  ts={ts}
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
          {selectedCluster && (
            <>
              <DialogHeader>
                <DialogTitle className={`${ts.heading} leading-snug`}>
                  {selectedCluster.title}
                </DialogTitle>
                <div className="flex flex-wrap gap-2 pt-1">
                  {selectedCluster.is_merged && (
                    <Badge variant="secondary">
                      {selectedCluster.source_count} sources
                    </Badge>
                  )}
                  {selectedCluster.topic_tags.map((tag) => (
                    <Badge key={tag} variant="outline">
                      {tag}
                    </Badge>
                  ))}
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
                  onClick={() => promote.mutate(selectedCluster.id)}
                  disabled={promote.isPending || selectedCluster.status === "promoted"}
                >
                  {promote.isPending ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <BookOpen className="mr-1.5 h-4 w-4" />
                  )}
                  {selectedCluster.status === "promoted" ? "Learned" : "Learn This"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => done.mutate(selectedCluster.id)}
                >
                  <Check className="mr-1.5 h-4 w-4" />
                  Done
                </Button>
              </div>
              {promote.isSuccess && (
                <p className={`mt-2 ${ts.small} text-green-600`}>
                  Added to knowledge base ({promote.data.indexed} article{promote.data.indexed !== 1 ? "s" : ""} indexed)
                </p>
              )}
              {promote.isError && (
                <p className={`mt-2 ${ts.small} text-destructive`}>
                  {promote.error.message}
                </p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
