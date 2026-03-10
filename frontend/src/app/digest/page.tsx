"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Layers,
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
import { useSettings, textSizeClasses } from "@/lib/settings-store";
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
  const textSize = useSettings((s) => s.textSize);
  const ts = textSizeClasses[textSize];

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
    <div className="min-h-screen">
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
        <span className={`${ts.small} text-muted-foreground`}>
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
        <p className={`${ts.body} text-muted-foreground`}>Loading digest...</p>
      )}

      {visibleClusters.length === 0 && !digest.isLoading && (
        <p className={`${ts.body} text-muted-foreground`}>
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
            className={`cursor-pointer transition-colors hover:bg-muted/50 ${cluster.is_merged ? "border-2" : ""}`}
            onClick={() => setSelectedCluster(cluster)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex items-center gap-2">
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
                  <CardTitle className={ts.heading}>{cluster.title}</CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className={`mb-4 ${ts.body} text-muted-foreground`}>
                {cluster.headline}
              </p>
              <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  onClick={() => done.mutate(cluster.id)}
                >
                  <Check className="mr-1.5 h-4 w-4" />
                  Done
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

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

                <TabsContent value="summary" className="mt-5 space-y-4">
                  <p className={`${ts.body} leading-relaxed`}>
                    {selectedCluster.summary}
                  </p>
                  {selectedCluster.bullets.length > 0 && (
                    <>
                      <Separator />
                      <ul className="space-y-3">
                        {selectedCluster.bullets.map((bullet, i) => (
                          <li
                            key={i}
                            className={`flex gap-2.5 ${ts.body} leading-relaxed`}
                          >
                            <span className="mt-0.5 text-muted-foreground">•</span>
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </TabsContent>

                <TabsContent value="quotes" className="mt-5 space-y-4">
                  {selectedCluster.quotes.length === 0 && (
                    <p className={`${ts.body} text-muted-foreground`}>
                      No quotes extracted.
                    </p>
                  )}
                  {selectedCluster.quotes.map((quote, i) => (
                    <blockquote
                      key={i}
                      className={`border-l-2 pl-5 ${ts.body} italic leading-relaxed text-muted-foreground`}
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
                        <p className={`font-medium ${ts.body}`}>
                          {source.source_name || "Unknown"}
                        </p>
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
                <Button variant="outline" disabled>
                  Learn This
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => done.mutate(selectedCluster.id)}
                >
                  <Check className="mr-1.5 h-4 w-4" />
                  Done
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
