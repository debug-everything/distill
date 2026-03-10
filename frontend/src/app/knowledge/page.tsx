"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Cloud,
  ExternalLink,
  Loader2,
  Monitor,
  Search,
  SendHorizonal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  useSettings,
  textSizeClasses,
  readingFontClasses,
  lineSpacingClasses,
} from "@/lib/settings-store";
import {
  queryKB,
  fetchKB,
  type QueryResponse,
  type KBListResponse,
} from "@/lib/api";

export default function KnowledgePage() {
  const [question, setQuestion] = useState("");
  const queryClient = useQueryClient();
  const textSize = useSettings((s) => s.textSize);
  const readingFont = useSettings((s) => s.readingFont);
  const lineSpacing = useSettings((s) => s.lineSpacing);
  const ts = textSizeClasses[textSize];
  const rf = readingFontClasses[readingFont];
  const ls = lineSpacingClasses[lineSpacing];

  const kb = useQuery<KBListResponse>({
    queryKey: ["kb"],
    queryFn: fetchKB,
  });

  const ask = useMutation({
    mutationFn: queryKB,
    onMutate: () => {
      // Immediately show "active" in navbar indicator
      queryClient.setQueryData(["llmStatus"], { llm_mode: null, is_active: true });
    },
    onSettled: () => {
      // Refresh actual status when done
      queryClient.invalidateQueries({ queryKey: ["llmStatus"] });
    },
  });

  const handleAsk = () => {
    const q = question.trim();
    if (!q) return;
    ask.mutate(q);
  };

  const handleRelatedQuestion = (q: string) => {
    setQuestion(q);
    ask.mutate(q);
  };

  return (
    <div className="min-h-screen">
      {/* Query input */}
      <section>
        <h1 className="mb-4 text-xl font-semibold">Knowledge Base</h1>
        <div className="flex gap-2">
          <textarea
            placeholder="Ask a question about your saved articles..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleAsk();
              }
            }}
            rows={1}
            className={`w-full flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${ts.body}`}
          />
          <Button
            onClick={handleAsk}
            disabled={!question.trim() || ask.isPending}
          >
            {ask.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SendHorizonal className="h-4 w-4" />
            )}
          </Button>
        </div>
      </section>

      {/* Answer */}
      {ask.isPending && (
        <div className="mt-6 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className={ts.body}>Searching knowledge base...</span>
        </div>
      )}

      {ask.isSuccess && ask.data && (
        <section className="mt-6">
          <Card>
            <CardContent className="p-6">
              <p className={`${ts.body} ${ls} ${rf} whitespace-pre-wrap`}>
                {ask.data.answer}
              </p>

              {/* LLM mode badge */}
              {ask.data.llm_mode && (
                <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                  {ask.data.llm_mode === "local" ? (
                    <Monitor className="h-3 w-3 text-green-500" />
                  ) : (
                    <Cloud className="h-3 w-3 text-amber-500" />
                  )}
                  <span>
                    {ask.data.llm_mode === "local" ? "Local LLM" : "Cloud LLM (paid)"}
                  </span>
                </div>
              )}

              {/* Sources */}
              {ask.data.sources.length > 0 && (
                <>
                  <Separator className="my-4" />
                  <h3 className={`mb-3 font-medium ${ts.small}`}>Sources</h3>
                  <div className="space-y-2">
                    {/* Deduplicate sources by knowledge_item_id */}
                    {Array.from(
                      new Map(
                        ask.data.sources.map((s) => [s.knowledge_item_id, s])
                      ).values()
                    ).map((source, i) => (
                      <div
                        key={source.knowledge_item_id + "-" + source.chunk_index}
                        className="flex items-center gap-3 rounded-md border p-3"
                      >
                        <Badge variant="secondary" className="shrink-0">
                          [{i + 1}]
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <p className={`font-medium ${ts.small}`}>
                            {source.title}
                          </p>
                          {source.url && (
                            <p className="truncate text-xs text-muted-foreground">
                              {source.url}
                            </p>
                          )}
                        </div>
                        {source.url && (
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Related questions */}
              {ask.data.related_questions.length > 0 && (
                <>
                  <Separator className="my-4" />
                  <h3 className={`mb-3 font-medium ${ts.small}`}>
                    Related questions
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {ask.data.related_questions.map((q, i) => (
                      <Button
                        key={i}
                        variant="outline"
                        size="sm"
                        onClick={() => handleRelatedQuestion(q)}
                        className="text-left"
                      >
                        <Search className="mr-1.5 h-3 w-3 shrink-0" />
                        {q}
                      </Button>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {ask.isError && (
        <p className={`mt-4 ${ts.small} text-destructive`}>
          {ask.error.message}
        </p>
      )}

      <Separator className="my-8" />

      {/* KB items list */}
      <section>
        <h2 className={`mb-4 font-medium ${ts.heading}`}>
          Indexed Articles{" "}
          {kb.data && (
            <span className="text-muted-foreground">({kb.data.total})</span>
          )}
        </h2>

        {kb.isLoading && (
          <p className={`${ts.small} text-muted-foreground`}>Loading...</p>
        )}

        {kb.data && kb.data.items.length === 0 && (
          <p className={`${ts.body} text-muted-foreground`}>
            No articles indexed yet. Use &quot;Learn Now&quot; when capturing or
            &quot;Learn This&quot; from the digest to add articles to your
            knowledge base.
          </p>
        )}

        {kb.data && kb.data.items.length > 0 && (
          <div className="space-y-2">
            {kb.data.items.map((item) => (
              <Card key={item.id}>
                <CardContent className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className={`font-medium ${ts.body}`}>{item.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {item.topic_tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="outline"
                          className="text-xs"
                        >
                          {tag}
                        </Badge>
                      ))}
                      <span className="text-xs text-muted-foreground">
                        {item.chunk_count} chunks
                      </span>
                    </div>
                  </div>
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
