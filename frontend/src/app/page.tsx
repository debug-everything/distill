"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  BookOpen,
  Zap,
  ExternalLink,
  AlertTriangle,
  Loader2,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useSettings, textSizeClasses } from "@/lib/settings-store";
import {
  captureUrl,
  fetchQueue,
  triggerProcess,
  fetchProcessingStatus,
  type CaptureResponse,
  type QueueResponse,
  type ProcessingStatus,
} from "@/lib/api";

export default function Home() {
  const [url, setUrl] = useState("");
  const queryClient = useQueryClient();
  const textSize = useSettings((s) => s.textSize);
  const ts = textSizeClasses[textSize];

  const queue = useQuery<QueueResponse>({
    queryKey: ["queue"],
    queryFn: fetchQueue,
    refetchInterval: 5000,
  });

  const processingStatus = useQuery<ProcessingStatus>({
    queryKey: ["processingStatus"],
    queryFn: fetchProcessingStatus,
    refetchInterval: 2000,
  });

  const capture = useMutation({
    mutationFn: captureUrl,
    onSuccess: (data: CaptureResponse) => {
      if (!data.duplicate) {
        setUrl("");
      }
      queryClient.invalidateQueries({ queryKey: ["queue"] });
    },
  });

  const process = useMutation({
    mutationFn: triggerProcess,
    onSuccess: () => {
      // Processing runs in the background — status polling handles the rest
      queryClient.invalidateQueries({ queryKey: ["processingStatus"] });
    },
  });

  // When processing finishes, refresh queue and digest
  const wasProcessing = processingStatus.data?.is_processing;
  const lastResult = processingStatus.data?.last_result;

  const handleCapture = (mode: "consume_later" | "learn_now") => {
    if (!url.trim()) return;
    capture.mutate({ url: url.trim(), mode });
  };

  const isProcessing =
    process.isPending || processingStatus.data?.is_processing;

  // Track when processing transitions from running → done
  const prevProcessingRef = useRef(false);
  useEffect(() => {
    if (prevProcessingRef.current && !wasProcessing) {
      // Processing just finished — refresh data
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      queryClient.invalidateQueries({ queryKey: ["digest"] });
    }
    prevProcessingRef.current = !!wasProcessing;
  }, [wasProcessing, queryClient]);

  return (
    <div className="min-h-screen">
      {/* Capture form */}
      <section>
        <h2 className={`mb-4 font-medium ${ts.heading}`}>Add content</h2>
        <div className="flex gap-2">
          <Input
            placeholder="Paste an article URL..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCapture("consume_later");
            }}
            className={`flex-1 ${ts.body}`}
          />
        </div>
        <div className="mt-3 flex gap-2">
          <Button
            onClick={() => handleCapture("learn_now")}
            disabled={!url.trim() || capture.isPending}
            variant="default"
          >
            {capture.isPending && capture.variables?.mode === "learn_now" ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Zap className="mr-1.5 h-4 w-4" />
            )}
            Learn Now
          </Button>
          <Button
            onClick={() => handleCapture("consume_later")}
            disabled={!url.trim() || capture.isPending}
            variant="outline"
          >
            {capture.isPending &&
            capture.variables?.mode === "consume_later" ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <BookOpen className="mr-1.5 h-4 w-4" />
            )}
            Read Later
          </Button>
        </div>

        {/* Feedback */}
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
      </section>

      <Separator className="my-8" />

      {/* Queue */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className={`font-medium ${ts.heading}`}>
            Queue{" "}
            {queue.data && (
              <span className="text-muted-foreground">
                ({queue.data.total})
              </span>
            )}
          </h2>
          <Button
            variant="outline"
            onClick={() => process.mutate()}
            disabled={
              isProcessing || !queue.data || queue.data.total === 0
            }
          >
            {isProcessing ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-1.5 h-4 w-4" />
            )}
            {isProcessing ? "Processing..." : "Process Now"}
          </Button>
        </div>

        {/* Processing status */}
        {isProcessing && processingStatus.data?.stage && (
          <div className="mb-4 rounded-md border bg-muted/50 p-4">
            <p className={ts.small}>
              {processingStatus.data.stage}
            </p>
            {processingStatus.data.total > 0 && (
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{
                    width: `${(processingStatus.data.current / processingStatus.data.total) * 100}%`,
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Process result */}
        {lastResult && !isProcessing && lastResult.ok && (
          <p className={`mb-4 ${ts.small} text-green-600`}>
            Created {lastResult.clusters_created} clusters from{" "}
            {lastResult.articles_processed} articles.{" "}
            <Link href="/digest" className="underline">
              View digest
            </Link>
          </p>
        )}
        {lastResult && !isProcessing && !lastResult.ok && (
          <p className={`mb-4 ${ts.small} text-destructive`}>
            Processing failed: {lastResult.detail}
          </p>
        )}

        {queue.isLoading && (
          <p className={`${ts.small} text-muted-foreground`}>Loading queue...</p>
        )}

        {queue.data && queue.data.items.length === 0 && (
          <p className={`${ts.body} text-muted-foreground`}>
            No articles queued. Paste a URL above to get started.
          </p>
        )}

        {queue.data && queue.data.items.length > 0 && (
          <div className="space-y-2">
            {queue.data.items.map((item) => (
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
