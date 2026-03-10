"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  Brain,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Layers,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  fetchDigest,
  markClusterDone,
  type DigestCluster,
  type DigestResponse,
} from "@/lib/api";

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export default function DigestPage() {
  const [selectedDate, setSelectedDate] = useState(
    () => new Date().toISOString().split("T")[0]
  );
  const [selectedCluster, setSelectedCluster] = useState<DigestCluster | null>(
    null
  );
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const digest = useQuery<DigestResponse>({
    queryKey: ["digest", selectedDate],
    queryFn: () => fetchDigest(selectedDate),
  });

  const done = useMutation({
    mutationFn: markClusterDone,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["digest"] });
      setSelectedCluster(null);
    },
  });

  // Collect all topics
  const allTopics = Array.from(
    new Set(
      digest.data?.clusters
        .filter((c) => c.status !== "done")
        .flatMap((c) => c.topic_tags) ?? []
    )
  ).sort();

  // Filter clusters
  const visibleClusters =
    digest.data?.clusters.filter((c) => {
      if (c.status === "done") return false;
      if (activeTopic && !c.topic_tags.includes(activeTopic)) return false;
      return true;
    }) ?? [];

  const isToday =
    selectedDate === new Date().toISOString().split("T")[0];

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4">
          <Link href="/" className="flex items-center gap-2">
            <Brain className="h-6 w-6" />
            <span className="text-lg font-semibold">Distill</span>
          </Link>
          <div className="ml-auto flex gap-2">
            <Link href="/">
              <Button variant="ghost" size="sm">
                + Add URL
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {/* Date nav + stats */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-xl font-semibold">
              {formatDate(selectedDate)} Digest
            </h1>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedDate(shiftDate(selectedDate, 1))}
              disabled={isToday}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <span className="text-sm text-muted-foreground">
            {visibleClusters.length} unread
          </span>
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

        {/* Clusters */}
        {digest.isLoading && (
          <p className="text-sm text-muted-foreground">Loading digest...</p>
        )}

        {visibleClusters.length === 0 && !digest.isLoading && (
          <p className="text-sm text-muted-foreground">
            No clusters for this date.{" "}
            <Link href="/" className="underline">
              Add articles
            </Link>{" "}
            and process them.
          </p>
        )}

        <div className="space-y-3">
          {visibleClusters.map((cluster) => (
            <Card
              key={cluster.id}
              className={cluster.is_merged ? "border-2" : ""}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
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
                    </div>
                    <CardTitle className="text-base">{cluster.title}</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-sm text-muted-foreground">
                  {cluster.headline}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedCluster(cluster)}
                  >
                    Open
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => done.mutate(cluster.id)}
                  >
                    <Check className="mr-1 h-4 w-4" />
                    Done
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>

      {/* Level 1/2 Drawer */}
      <Sheet
        open={!!selectedCluster}
        onOpenChange={(open) => !open && setSelectedCluster(null)}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {selectedCluster && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedCluster.title}</SheetTitle>
                <div className="flex flex-wrap gap-2">
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
              </SheetHeader>

              <Tabs defaultValue="summary" className="mt-6">
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

                <TabsContent value="summary" className="mt-4 space-y-4">
                  <p className="text-sm">{selectedCluster.summary}</p>
                  {selectedCluster.bullets.length > 0 && (
                    <>
                      <Separator />
                      <ul className="space-y-2">
                        {selectedCluster.bullets.map((bullet, i) => (
                          <li
                            key={i}
                            className="flex gap-2 text-sm"
                          >
                            <span className="text-muted-foreground">•</span>
                            {bullet}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </TabsContent>

                <TabsContent value="quotes" className="mt-4 space-y-3">
                  {selectedCluster.quotes.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No quotes extracted.
                    </p>
                  )}
                  {selectedCluster.quotes.map((quote, i) => (
                    <blockquote
                      key={i}
                      className="border-l-2 pl-4 text-sm italic text-muted-foreground"
                    >
                      &ldquo;{quote}&rdquo;
                    </blockquote>
                  ))}
                </TabsContent>

                <TabsContent value="sources" className="mt-4 space-y-3">
                  {selectedCluster.sources.map((source) => (
                    <div
                      key={source.article_id}
                      className="flex items-center justify-between rounded-md border p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {source.source_name || "Unknown"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {source.source_url}
                        </p>
                      </div>
                      <a
                        href={source.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 shrink-0 text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  ))}
                </TabsContent>
              </Tabs>

              <Separator className="my-6" />

              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled>
                  Learn This
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => done.mutate(selectedCluster.id)}
                >
                  <Check className="mr-1 h-4 w-4" />
                  Done
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
