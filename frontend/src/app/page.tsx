"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  BookOpen,
  Check,
  ExternalLink,
  AlertTriangle,
  Loader2,
  Play,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useSettings, textSizeClasses } from "@/lib/settings-store";
import {
  captureUrl,
  captureBatch,
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

export default function Home() {
  const [input, setInput] = useState("");
  const queryClient = useQueryClient();
  const textSize = useSettings((s) => s.textSize);
  const ts = textSizeClasses[textSize];

  // Smart polling flags — only poll status when processing is active
  const [digestPolling, setDigestPolling] = useState(false);
  const [learnNowPolling, setLearnNowPolling] = useState(false);

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

  // Stop polling when processing completes
  const prevDigestProcessing = useRef(false);
  useEffect(() => {
    const isActive = digestStatus.data?.is_processing ?? false;
    if (prevDigestProcessing.current && !isActive) {
      // Just finished — refresh data, stop polling
      setDigestPolling(false);
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      queryClient.invalidateQueries({ queryKey: ["digest"] });
    }
    prevDigestProcessing.current = isActive;
  }, [digestStatus.data?.is_processing, queryClient]);

  const prevLearnNowProcessing = useRef(false);
  useEffect(() => {
    const isActive = learnNowStatus.data?.is_processing ?? false;
    if (prevLearnNowProcessing.current && !isActive) {
      // Just finished — refresh data, stop polling
      setLearnNowPolling(false);
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      queryClient.invalidateQueries({ queryKey: ["kb"] });
    }
    prevLearnNowProcessing.current = isActive;
  }, [learnNowStatus.data?.is_processing, queryClient]);

  // Single URL capture
  const capture = useMutation({
    mutationFn: captureUrl,
    onSuccess: (data: CaptureResponse) => {
      if (!data.duplicate) {
        setInput("");
      }
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      // If learn_now, start polling
      if (capture.variables?.mode === "learn_now" && !data.duplicate) {
        setLearnNowPolling(true);
      }
    },
  });

  // Batch capture
  const batchCapture = useMutation({
    mutationFn: ({ urls, mode }: { urls: string[]; mode: "consume_later" | "learn_now" }) =>
      captureBatch(urls, mode),
    onSuccess: (data: BatchCaptureResponse) => {
      setInput("");
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      // If learn_now with new articles, start polling
      if (batchCapture.variables?.mode === "learn_now" && data.added > 0) {
        setLearnNowPolling(true);
      }
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
  const digestResult = digestStatus.data?.last_result;

  const isLearnNowProcessing = learnNowStatus.data?.is_processing;
  const learnNowResult = learnNowStatus.data?.last_result;

  const consumeLater = queue.data?.consume_later;
  const learnNow = queue.data?.learn_now;

  return (
    <div className="min-h-screen">
      {/* Capture form */}
      <section>
        <h2 className={`mb-4 font-medium ${ts.heading}`}>Add content</h2>
        <textarea
          placeholder="Paste article URLs (one per line)..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !isMulti) {
              e.preventDefault();
              handleCapture("consume_later");
            }
          }}
          rows={isMulti ? Math.min(urls.length + 1, 8) : 1}
          className={`w-full resize-none rounded-md border border-input bg-background px-3 py-2 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${ts.body}`}
        />
        {isMulti && (
          <p className={`mt-1 ${ts.small} text-muted-foreground`}>
            {urls.length} URLs detected
          </p>
        )}
        <div className="mt-3 flex gap-2">
          <Button
            onClick={() => handleCapture("learn_now")}
            disabled={urls.length === 0 || isBusy}
            variant="default"
          >
            {isBusy && (capture.variables?.mode === "learn_now" || batchCapture.variables?.mode === "learn_now") ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Zap className="mr-1.5 h-4 w-4" />
            )}
            Learn Now{isMulti ? ` (${urls.length})` : ""}
          </Button>
          <Button
            onClick={() => handleCapture("consume_later")}
            disabled={urls.length === 0 || isBusy}
            variant="outline"
          >
            {isBusy && (capture.variables?.mode === "consume_later" || batchCapture.variables?.mode === "consume_later") ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <BookOpen className="mr-1.5 h-4 w-4" />
            )}
            Read Later{isMulti ? ` (${urls.length})` : ""}
          </Button>
        </div>

        {/* Single capture feedback */}
        {capture.isSuccess && capture.data.duplicate && (
          <p className={`mt-2 ${ts.small} text-muted-foreground`}>
            Already in your queue.
          </p>
        )}
        {capture.isSuccess && !capture.data.duplicate && (
          <p className={`mt-2 ${ts.small} text-green-600`}>
            Added: {capture.data.title || "Untitled"}
            {capture.data.extraction_quality === "low" && (
              <span className="ml-2 text-amber-600">
                (possible paywall — limited content)
              </span>
            )}
          </p>
        )}
        {capture.isError && (
          <p className={`mt-2 ${ts.small} text-destructive`}>
            {capture.error.message}
          </p>
        )}

        {/* Batch capture feedback */}
        {batchCapture.isSuccess && (
          <div className={`mt-2 space-y-1 ${ts.small}`}>
            <p className="text-green-600">
              Added {batchCapture.data.added} article{batchCapture.data.added !== 1 ? "s" : ""}
              {batchCapture.data.duplicates > 0 && (
                <span className="text-muted-foreground">
                  {" "}· {batchCapture.data.duplicates} duplicate{batchCapture.data.duplicates !== 1 ? "s" : ""} skipped
                </span>
              )}
            </p>
            {batchCapture.data.failed > 0 && (
              <div className="text-destructive">
                {batchCapture.data.results
                  .filter((r) => !r.ok)
                  .map((r) => (
                    <p key={r.url} className="truncate">
                      Failed: {r.url} — {r.error}
                    </p>
                  ))}
              </div>
            )}
          </div>
        )}
        {batchCapture.isError && (
          <p className={`mt-2 ${ts.small} text-destructive`}>
            {batchCapture.error.message}
          </p>
        )}
      </section>

      <Separator className="my-8" />

      {/* Learn Now section */}
      <section>
        <h2 className={`mb-4 font-medium ${ts.heading}`}>
          Learn Now{" "}
          {learnNow && (
            <span className="text-muted-foreground">
              ({learnNow.total})
            </span>
          )}
        </h2>

        {/* Learn Now processing status */}
        {isLearnNowProcessing && learnNowStatus.data?.stage && (
          <div className="mb-4 rounded-md border bg-muted/50 p-4">
            <p className={ts.small}>
              {learnNowStatus.data.stage}
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

        {/* Learn Now result */}
        {learnNowResult && !isLearnNowProcessing && learnNowResult.ok && (
          <p className={`mb-4 ${ts.small} text-green-600`}>
            Indexed {learnNowResult.indexed} article{learnNowResult.indexed !== 1 ? "s" : ""} to knowledge base.{" "}
            <Link href="/knowledge" className="underline">
              View knowledge base
            </Link>
          </p>
        )}
        {learnNowResult && !isLearnNowProcessing && !learnNowResult.ok && (
          <p className={`mb-4 ${ts.small} text-destructive`}>
            Indexing failed: {learnNowResult.detail}
          </p>
        )}

        {learnNow && learnNow.items.length === 0 && !isLearnNowProcessing && (
          <p className={`${ts.body} text-muted-foreground`}>
            No recent Learn Now articles.
          </p>
        )}

        {learnNow && learnNow.items.length > 0 && (
          <div className="space-y-2">
            {learnNow.items.map((item) => (
              <Card key={item.id}>
                <CardContent className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className={`truncate font-medium ${ts.body}`}>
                      {item.title || item.url}
                    </p>
                    <p className={`${ts.small} text-muted-foreground`}>
                      {item.source_domain}
                    </p>
                  </div>
                  {item.status === "indexing" && (
                    <Badge variant="outline" className="shrink-0">
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      Indexing
                    </Badge>
                  )}
                  {item.status === "kb_indexed" && (
                    <Badge variant="secondary" className="shrink-0">
                      <Check className="mr-1 h-3 w-3" />
                      Indexed
                    </Badge>
                  )}
                  {item.status === "failed" && (
                    <Badge variant="outline" className="shrink-0 border-red-300 text-red-600">
                      <AlertTriangle className="mr-1 h-3 w-3" />
                      Failed
                    </Badge>
                  )}
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Separator className="my-8" />

      {/* Read Later Queue */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className={`font-medium ${ts.heading}`}>
            Read Later{" "}
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
            {isDigestProcessing ? "Processing..." : "Process Now"}
          </Button>
        </div>

        {/* Digest processing status */}
        {isDigestProcessing && digestStatus.data?.stage && (
          <div className="mb-4 rounded-md border bg-muted/50 p-4">
            <p className={ts.small}>
              {digestStatus.data.stage}
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

        {/* Digest result */}
        {digestResult && !isDigestProcessing && digestResult.ok && (
          <p className={`mb-4 ${ts.small} text-green-600`}>
            Created {digestResult.clusters_created} clusters from{" "}
            {digestResult.articles_processed} articles.{" "}
            <Link href="/digest" className="underline">
              View digest
            </Link>
          </p>
        )}
        {digestResult && !isDigestProcessing && !digestResult.ok && (
          <p className={`mb-4 ${ts.small} text-destructive`}>
            Processing failed: {digestResult.detail}
          </p>
        )}

        {queue.isLoading && (
          <p className={`${ts.small} text-muted-foreground`}>Loading queue...</p>
        )}

        {consumeLater && consumeLater.items.length === 0 && (
          <p className={`${ts.body} text-muted-foreground`}>
            No articles queued. Paste a URL above and click Read Later.
          </p>
        )}

        {consumeLater && consumeLater.items.length > 0 && (
          <div className="space-y-2">
            {consumeLater.items.map((item) => (
              <Card key={item.id}>
                <CardContent className="flex items-center gap-3 py-4">
                  <div className="min-w-0 flex-1">
                    <p className={`truncate font-medium ${ts.body}`}>
                      {item.title || item.url}
                    </p>
                    <p className={`${ts.small} text-muted-foreground`}>
                      {item.source_domain}
                    </p>
                  </div>
                  {item.extraction_quality === "low" && (
                    <Badge
                      variant="outline"
                      className="shrink-0 border-amber-300 text-amber-600"
                    >
                      <AlertTriangle className="mr-1 h-3 w-3" />
                      Paywall
                    </Badge>
                  )}
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
