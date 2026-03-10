"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  Brain,
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
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      queryClient.invalidateQueries({ queryKey: ["digest"] });
    },
  });

  const handleCapture = (mode: "consume_later" | "learn_now") => {
    if (!url.trim()) return;
    capture.mutate({ url: url.trim(), mode });
  };

  const isProcessing =
    process.isPending || processingStatus.data?.is_processing;

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4">
          <Brain className="h-6 w-6" />
          <span className="text-lg font-semibold">Distill</span>
          <div className="ml-auto flex gap-2">
            <Link href="/digest">
              <Button variant="ghost" size="sm">
                Digest
              </Button>
            </Link>
            <Button variant="ghost" size="sm" disabled>
              Knowledge Base
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {/* Capture form */}
        <section>
          <h2 className="mb-3 text-lg font-medium">Add content</h2>
          <div className="flex gap-2">
            <Input
              placeholder="Paste an article URL..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCapture("consume_later");
              }}
              className="flex-1"
            />
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              onClick={() => handleCapture("learn_now")}
              disabled={!url.trim() || capture.isPending}
              variant="default"
              size="sm"
            >
              {capture.isPending && capture.variables?.mode === "learn_now" ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Zap className="mr-1 h-4 w-4" />
              )}
              Learn Now
            </Button>
            <Button
              onClick={() => handleCapture("consume_later")}
              disabled={!url.trim() || capture.isPending}
              variant="outline"
              size="sm"
            >
              {capture.isPending &&
              capture.variables?.mode === "consume_later" ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <BookOpen className="mr-1 h-4 w-4" />
              )}
              Read Later
            </Button>
          </div>

          {/* Feedback */}
          {capture.isSuccess && capture.data.duplicate && (
            <p className="mt-2 text-sm text-muted-foreground">
              Already in your queue.
            </p>
          )}
          {capture.isSuccess && !capture.data.duplicate && (
            <p className="mt-2 text-sm text-green-600">
              Added: {capture.data.title || "Untitled"}
              {capture.data.extraction_quality === "low" && (
                <span className="ml-2 text-amber-600">
                  (possible paywall — limited content)
                </span>
              )}
            </p>
          )}
          {capture.isError && (
            <p className="mt-2 text-sm text-destructive">
              {capture.error.message}
            </p>
          )}
        </section>

        <Separator className="my-8" />

        {/* Queue */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-medium">
              Queue{" "}
              {queue.data && (
                <span className="text-muted-foreground">
                  ({queue.data.total})
                </span>
              )}
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => process.mutate()}
              disabled={
                isProcessing || !queue.data || queue.data.total === 0
              }
            >
              {isProcessing ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-1 h-4 w-4" />
              )}
              {isProcessing ? "Processing..." : "Process Now"}
            </Button>
          </div>

          {/* Processing status */}
          {isProcessing && processingStatus.data?.stage && (
            <div className="mb-3 rounded-md border bg-muted/50 p-3">
              <p className="text-sm">
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
          {process.isSuccess && !isProcessing && (
            <p className="mb-3 text-sm text-green-600">
              Created {process.data.clusters_created} clusters from{" "}
              {process.data.articles_processed} articles.{" "}
              <Link href="/digest" className="underline">
                View digest
              </Link>
            </p>
          )}

          {queue.isLoading && (
            <p className="text-sm text-muted-foreground">Loading queue...</p>
          )}

          {queue.data && queue.data.items.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No articles queued. Paste a URL above to get started.
            </p>
          )}

          {queue.data && queue.data.items.length > 0 && (
            <div className="space-y-2">
              {queue.data.items.map((item) => (
                <Card key={item.id}>
                  <CardContent className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {item.title || item.url}
                      </p>
                      <p className="text-xs text-muted-foreground">
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
      </main>
    </div>
  );
}
