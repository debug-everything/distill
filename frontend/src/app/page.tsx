"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Play,
  Trash2,
  Video,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useSettings, textSizeClasses } from "@/lib/settings-store";
import {
  captureUrl,
  captureBatch,
  deleteArticle,
  fetchQueue,
  triggerProcess,
  fetchProcessingStatus,
  fetchLearnNowStatus,
  type CaptureResponse,
  type BatchCaptureResponse,
  type QueueResponse,
  type ProcessingStatus,
  type LearnNowStatus,
} from "@/lib/api";

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

export default function Home() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [captureMode, setCaptureMode] = useState<"consume_later" | "learn_now">("consume_later");

  // Bookmarklet support: auto-capture from ?url= query param
  const bookmarkletUrl = useRef<string | null>(null);
  useEffect(() => {
    const url = new URLSearchParams(window.location.search).get("url");
    if (url) {
      setInput(url);
      bookmarkletUrl.current = url;
      // Clean the URL bar so refreshing doesn't re-trigger
      window.history.replaceState({}, "", "/");
    }
  }, []);
  const queryClient = useQueryClient();
  const textSize = useSettings((s) => s.textSize);
  const ts = textSizeClasses[textSize];

  // Smart polling flags — only poll status when processing is active
  const [digestPolling, setDigestPolling] = useState(false);
  const [learnNowPolling, setLearnNowPolling] = useState(false);

  // Client-side elapsed time tracking (updated on each poll tick)
  const digestStartedAt = useRef<number | null>(null);
  const [digestElapsed, setDigestElapsed] = useState<number>(0);
  const learnNowStartedAt = useRef<number | null>(null);
  const [learnNowElapsed, setLearnNowElapsed] = useState<number>(0);

  const queue = useQuery<QueueResponse>({
    queryKey: ["queue"],
    queryFn: fetchQueue,
    refetchInterval: 5000,
  });

  // Digest processing status — only poll when active
  const digestStatus = useQuery<ProcessingStatus>({
    queryKey: ["digestStatus"],
    queryFn: fetchProcessingStatus,
    refetchInterval: digestPolling ? 2000 : false,
    enabled: digestPolling,
  });

  // Learn Now status — only poll when active
  const learnNowStatus = useQuery<LearnNowStatus>({
    queryKey: ["learnNowStatus"],
    queryFn: fetchLearnNowStatus,
    refetchInterval: learnNowPolling ? 2000 : false,
    enabled: learnNowPolling,
  });

  // Stop polling when processing completes + track elapsed time
  const prevDigestProcessing = useRef(false);
  useEffect(() => {
    const isActive = digestStatus.data?.is_processing ?? false;
    if (isActive && !prevDigestProcessing.current) {
      // Just started
      digestStartedAt.current = Date.now();
      setDigestElapsed(0);
    } else if (isActive && digestStartedAt.current) {
      // Still processing — update elapsed on each poll tick
      setDigestElapsed(Math.round((Date.now() - digestStartedAt.current) / 1000));
    } else if (prevDigestProcessing.current && !isActive) {
      // Just finished — capture final elapsed, refresh data, stop polling, redirect
      if (digestStartedAt.current) {
        setDigestElapsed(Math.round((Date.now() - digestStartedAt.current) / 1000));
      }
      digestStartedAt.current = null;
      setDigestPolling(false);
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      queryClient.invalidateQueries({ queryKey: ["digest"] });
      const result = digestStatus.data?.last_result;
      if (result?.ok) {
        const time = digestStartedAt.current ? "" : digestElapsed > 0 ? ` in ${formatElapsed(digestElapsed)}` : "";
        toast.success(`Created ${result.clusters_created} clusters from ${result.articles_processed} articles${time}`);
        router.push("/digest");
      } else if (result && !result.ok) {
        toast.error(`Processing failed: ${result.detail}`);
      }
    }
    prevDigestProcessing.current = isActive;
  }, [digestStatus.data?.is_processing, digestStatus.dataUpdatedAt, queryClient]);

  const prevLearnNowProcessing = useRef(false);
  useEffect(() => {
    const isActive = learnNowStatus.data?.is_processing ?? false;
    if (isActive && !prevLearnNowProcessing.current) {
      learnNowStartedAt.current = Date.now();
      setLearnNowElapsed(0);
    } else if (isActive && learnNowStartedAt.current) {
      setLearnNowElapsed(Math.round((Date.now() - learnNowStartedAt.current) / 1000));
    } else if (prevLearnNowProcessing.current && !isActive) {
      const elapsed = learnNowStartedAt.current
        ? Math.round((Date.now() - learnNowStartedAt.current) / 1000)
        : 0;
      if (learnNowStartedAt.current) setLearnNowElapsed(elapsed);
      learnNowStartedAt.current = null;
      setLearnNowPolling(false);
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      queryClient.invalidateQueries({ queryKey: ["kb"] });
      const result = learnNowStatus.data?.last_result;
      if (result?.ok) {
        const time = elapsed > 0 ? ` in ${formatElapsed(elapsed)}` : "";
        toast.success(`Indexed ${result.indexed} article${result.indexed !== 1 ? "s" : ""} to knowledge base${time}`);
      } else if (result && !result.ok) {
        toast.error(`Indexing failed: ${result.detail}`);
      }
    }
    prevLearnNowProcessing.current = isActive;
  }, [learnNowStatus.data?.is_processing, learnNowStatus.dataUpdatedAt, queryClient]);

  // Single URL capture
  const capture = useMutation({
    mutationFn: captureUrl,
    onSuccess: (data: CaptureResponse) => {
      if (data.duplicate) {
        toast.info("Already in your queue");
      } else {
        setInput("");
        const title = data.title || "Untitled";
        const isLearnNow = capture.variables?.mode === "learn_now";
        if (data.extraction_quality === "low" && isLearnNow) {
          toast.warning(`Indexing "${title}" — possible paywall, content may be limited. Review in Knowledge Base.`, {
            duration: 8000,
          });
        } else {
          const paywall = data.extraction_quality === "low" ? " (possible paywall)" : "";
          toast.success(`Added: ${title}${paywall}`);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      if (capture.variables?.mode === "learn_now" && !data.duplicate) {
        setLearnNowPolling(true);
      }
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  // Auto-submit bookmarklet URL
  useEffect(() => {
    if (bookmarkletUrl.current) {
      const url = bookmarkletUrl.current;
      bookmarkletUrl.current = null;
      capture.mutate({ url, mode: "consume_later" });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Batch capture
  const batchCapture = useMutation({
    mutationFn: ({ urls, mode }: { urls: string[]; mode: "consume_later" | "learn_now" }) =>
      captureBatch(urls, mode),
    onSuccess: (data: BatchCaptureResponse) => {
      setInput("");
      const parts = [`Added ${data.added} article${data.added !== 1 ? "s" : ""}`];
      if (data.duplicates > 0) parts.push(`${data.duplicates} duplicate${data.duplicates !== 1 ? "s" : ""} skipped`);
      if (data.failed > 0) parts.push(`${data.failed} failed`);
      const paywallCount = data.results.filter((r) => r.ok && !r.duplicate && r.extraction_quality === "low").length;
      if (data.failed > 0) {
        toast.warning(parts.join(" · "));
      } else {
        toast.success(parts.join(" · "));
      }
      if (paywallCount > 0 && batchCapture.variables?.mode === "learn_now") {
        toast.warning(`${paywallCount} article${paywallCount !== 1 ? "s" : ""} may have limited content (paywall). Review in Knowledge Base.`, {
          duration: 8000,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      if (batchCapture.variables?.mode === "learn_now" && data.added > 0) {
        setLearnNowPolling(true);
      }
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  // Remove queue item
  const removeArticle = useMutation({
    mutationFn: deleteArticle,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      toast.success("Removed from queue");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  // Digest process
  const process = useMutation({
    mutationFn: triggerProcess,
    onSuccess: () => {
      setDigestPolling(true);
    },
  });

  // Parse URLs from input
  const urls = input
    .split(/[\n\r]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const isMulti = urls.length > 1;
  const isBusy = capture.isPending || batchCapture.isPending;

  const handleCapture = (mode: "consume_later" | "learn_now") => {
    if (urls.length === 0) return;
    if (isMulti) {
      batchCapture.mutate({ urls, mode });
    } else {
      capture.mutate({ url: urls[0], mode });
    }
  };

  const isDigestProcessing =
    process.isPending || digestStatus.data?.is_processing;

  const isLearnNowProcessing = learnNowStatus.data?.is_processing;

  const consumeLater = queue.data?.consume_later;
  const [queueExpanded, setQueueExpanded] = useState(false);


  return (
    <div className="min-h-screen">
      {/* Capture form */}
      <section>
        <h2 className={`mb-4 font-medium ${ts.heading}`}>Add content</h2>

        {/* Mode toggle */}
        <div className="mb-3 inline-flex rounded-lg border p-1">
          <button
            type="button"
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 ${ts.small} font-medium transition-colors ${
              captureMode === "consume_later"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setCaptureMode("consume_later")}
          >
            <BookOpen className="h-3.5 w-3.5" />
            Digest Queue
          </button>
          <button
            type="button"
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 ${ts.small} font-medium transition-colors ${
              captureMode === "learn_now"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setCaptureMode("learn_now")}
          >
            <Zap className="h-3.5 w-3.5" />
            Knowledge Base
          </button>
        </div>

        <p className={`mb-3 ${ts.small} text-muted-foreground`}>
          {captureMode === "consume_later"
            ? "Articles are queued for your next digest — summarized, clustered, and ready to scan."
            : "Articles are extracted, chunked, and indexed immediately — searchable via RAG."}
        </p>

        <div className="flex gap-2">
          <textarea
            placeholder="Paste links (articles or YouTube, one per line)…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !isMulti) {
                e.preventDefault();
                handleCapture(captureMode);
              }
            }}
            rows={isMulti ? Math.min(urls.length + 1, 8) : 1}
            className={`w-full flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${ts.body}`}
          />
          <Button
            onClick={() => handleCapture(captureMode)}
            disabled={urls.length === 0 || isBusy}
          >
            {isBusy ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : captureMode === "consume_later" ? (
              <BookOpen className="mr-1.5 h-4 w-4" />
            ) : (
              <Zap className="mr-1.5 h-4 w-4" />
            )}
            {isMulti ? `Add (${urls.length})` : "Add"}
          </Button>
        </div>
        {isMulti && (
          <p className={`mt-1 ${ts.small} text-muted-foreground`}>
            {urls.length} URLs detected
          </p>
        )}
      </section>

      {/* Learn Now transient status (shown inline below capture form) */}
      {isLearnNowProcessing && learnNowStatus.data?.stage && (
        <div className="mt-4 rounded-md border bg-muted/50 p-4">
          <p className={ts.small}>
            {learnNowStatus.data.stage}
            {learnNowElapsed > 0 && (
              <span className="ml-2 text-muted-foreground">({formatElapsed(learnNowElapsed)})</span>
            )}
          </p>
          {learnNowStatus.data.total > 0 && (
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{
                  width: `${(learnNowStatus.data.current / learnNowStatus.data.total) * 100}%`,
                }}
              />
            </div>
          )}
        </div>
      )}
      {/* Learn now completion feedback handled via toasts */}

      <Separator className="my-8" />

      {/* Digest Queue */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className={`font-medium ${ts.heading}`}>
            Digest Queue{" "}
            {consumeLater && (
              <span className="text-muted-foreground">
                ({consumeLater.total})
              </span>
            )}
          </h2>
          <Button
            variant="outline"
            onClick={() => process.mutate()}
            disabled={
              isDigestProcessing || !consumeLater || consumeLater.total === 0
            }
          >
            {isDigestProcessing ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-1.5 h-4 w-4" />
            )}
            {isDigestProcessing
              ? `Processing... ${digestElapsed > 0 ? formatElapsed(digestElapsed) : ""}`
              : "Generate Digest"}
          </Button>
        </div>

        {/* Digest processing status */}
        {isDigestProcessing && digestStatus.data?.stage && (
          <div className="mb-4 rounded-md border bg-muted/50 p-4">
            <p className={ts.small}>
              {digestStatus.data.stage}
              {digestElapsed > 0 && (
                <span className="ml-2 text-muted-foreground">({formatElapsed(digestElapsed)})</span>
              )}
            </p>
            {digestStatus.data.total > 0 && (
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{
                    width: `${(digestStatus.data.current / digestStatus.data.total) * 100}%`,
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Digest completion feedback handled via toasts + auto-redirect */}

        {queue.isLoading && (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="flex items-center gap-3 py-4">
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                  <Skeleton className="h-4 w-4 shrink-0" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {consumeLater && consumeLater.items.length === 0 && (
          <p className={`${ts.body} text-muted-foreground`}>
            No articles queued. Paste a URL above and click &ldquo;Add to Digest Queue&rdquo;.
          </p>
        )}

        {consumeLater && consumeLater.items.length > 0 && (
          <div className="space-y-2">
            {/* Compact summary line */}
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md border bg-muted/30 px-4 py-3 text-left transition-colors hover:bg-muted/60"
              onClick={() => setQueueExpanded((prev) => !prev)}
            >
              <span className={`flex-1 ${ts.body}`}>
                <span className="font-medium">{consumeLater.total}</span>{" "}
                <span className="text-muted-foreground">
                  article{consumeLater.total !== 1 ? "s" : ""} queued
                  {consumeLater.items.filter((i) => i.content_type === "video").length > 0 && (
                    <> · {consumeLater.items.filter((i) => i.content_type === "video").length} video{consumeLater.items.filter((i) => i.content_type === "video").length !== 1 ? "s" : ""}</>
                  )}
                  {consumeLater.items.filter((i) => i.extraction_quality === "low").length > 0 && (
                    <> · {consumeLater.items.filter((i) => i.extraction_quality === "low").length} paywall</>
                  )}
                </span>
              </span>
              {queueExpanded ? (
                <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
            </button>

            {/* Expandable item list — compact rows */}
            {queueExpanded && (
              <div className="rounded-md border divide-y">
                {consumeLater.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className={`truncate ${ts.small}`}>
                        <span className="font-medium">{item.title || item.url}</span>
                        <span className="ml-2 text-muted-foreground">{item.source_domain}</span>
                      </p>
                    </div>
                    {item.content_type === "video" && (
                      <span title="Video"><Video className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /></span>
                    )}
                    {item.extraction_quality === "low" && (
                      <span title="Paywall"><AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" /></span>
                    )}
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <button
                      type="button"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeArticle.mutate(item.id)}
                      disabled={removeArticle.isPending}
                      title="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Prominent Generate Digest CTA below queue */}
            {!isDigestProcessing && (
              <div className="mt-4 flex items-center justify-between rounded-md border border-dashed p-4">
                <p className={`${ts.small} text-muted-foreground`}>
                  {consumeLater.total} article{consumeLater.total !== 1 ? "s" : ""} ready · Generate a digest to read summaries
                </p>
                <Button
                  onClick={() => process.mutate()}
                  disabled={isDigestProcessing}
                >
                  <Play className="mr-1.5 h-4 w-4" />
                  Generate Digest
                </Button>
              </div>
            )}
          </div>
        )}
      </section>

    </div>
  );
}
