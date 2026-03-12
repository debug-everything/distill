"use client";

import { useState, useRef, useEffect } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";

const KB_PAGE_SIZE = 10;
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

interface QAEntry {
  question: string;
  response: QueryResponse;
}

export default function KnowledgePage() {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<QAEntry[]>([]);
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [kbOffset, setKbOffset] = useState(0);
  const queryClient = useQueryClient();
  const textSize = useSettings((s) => s.textSize);
  const readingFont = useSettings((s) => s.readingFont);
  const lineSpacing = useSettings((s) => s.lineSpacing);
  const ts = textSizeClasses[textSize];
  const rf = readingFontClasses[readingFont];
  const ls = lineSpacingClasses[lineSpacing];

  const kb = useQuery<KBListResponse>({
    queryKey: ["kb", kbOffset],
    queryFn: () => fetchKB(kbOffset, KB_PAGE_SIZE),
  });

  const ask = useMutation({
    mutationFn: queryKB,
    onMutate: () => {
      queryClient.setQueryData(["llmStatus"], { llm_mode: null, is_active: true });
    },
    onSuccess: (data, questionText) => {
      setHistory((prev) => [...prev, { question: questionText, response: data }]);
      setQuestion("");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["llmStatus"] });
    },
  });

  // Scroll latest question into view when history grows or query starts
  const latestQuestionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    latestQuestionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [history.length, ask.isPending]);

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

      {/* Conversation thread */}
      {(history.length > 0 || ask.isPending) && (
        <section className="mt-6 space-y-4">
          {history.map((entry, idx) => {
            const isLatest = idx === history.length - 1 && !ask.isPending;
            const isLastEntry = idx === history.length - 1;
            return (
              <div key={idx} className="space-y-3">
                {/* Question */}
                <div className="flex justify-end" ref={isLastEntry && !ask.isPending ? latestQuestionRef : undefined}>
                  <div className={`max-w-[80%] rounded-lg bg-primary/10 px-4 py-2 ${ts.body}`}>
                    {entry.question}
                  </div>
                </div>

                {/* Answer */}
                <Card>
                  <CardContent className="p-6">
                    <p className={`${ts.body} ${ls} ${rf} whitespace-pre-wrap`}>
                      {entry.response.answer}
                    </p>

                    {entry.response.llm_mode && (
                      <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {entry.response.llm_mode === "local" ? (
                          <Monitor className="h-3 w-3 text-green-500" />
                        ) : (
                          <Cloud className="h-3 w-3 text-amber-500" />
                        )}
                        <span>
                          {entry.response.llm_mode === "local" ? "Local LLM" : "Cloud LLM (paid)"}
                        </span>
                      </div>
                    )}

                    {entry.response.sources.length > 0 && (
                      <>
                        <Separator className="my-4" />
                        <h3 className={`mb-3 font-medium ${ts.small}`}>Sources</h3>
                        <div className="space-y-2">
                          {Array.from(
                            new Map(
                              entry.response.sources.map((s) => [s.knowledge_item_id, s])
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

                    {/* Related questions — only on the latest answer */}
                    {isLatest && entry.response.related_questions.length > 0 && (
                      <>
                        <Separator className="my-4" />
                        <h3 className={`mb-3 font-medium ${ts.small}`}>
                          Related questions
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {entry.response.related_questions.map((q, i) => (
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
              </div>
            );
          })}

          {/* Pending indicator */}
          {ask.isPending && (
            <div className="space-y-3">
              <div className="flex justify-end" ref={latestQuestionRef}>
                <div className={`max-w-[80%] rounded-lg bg-primary/10 px-4 py-2 ${ts.body}`}>
                  {ask.variables}
                </div>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className={ts.body}>Searching knowledge base...</span>
              </div>
            </div>
          )}

          {ask.isError && (
            <p className={`${ts.small} text-destructive`}>
              {ask.error.message}
            </p>
          )}

        </section>
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

        {/* Topic filter pills */}
        {kb.data && kb.data.topics.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            <Badge
              variant={activeTopic === null ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setActiveTopic(null)}
            >
              All
            </Badge>
            {kb.data.topics.map((topic) => (
              <Badge
                key={topic}
                variant={activeTopic === topic ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setActiveTopic(activeTopic === topic ? null : topic)}
              >
                {topic}
              </Badge>
            ))}
          </div>
        )}

        {kb.isLoading && (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Card key={i}>
                <CardContent className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <div className="flex gap-2">
                      <Skeleton className="h-5 w-16 rounded-full" />
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {kb.data && kb.data.total === 0 && (
          <p className={`${ts.body} text-muted-foreground`}>
            No articles indexed yet. Use &quot;Save to Knowledge Base&quot; when capturing,
            or promote articles from the digest to add them here.
          </p>
        )}

        {kb.data && kb.data.items.length > 0 && (
          <>
            <div className="space-y-2">
              {kb.data.items
                .filter((item) => !activeTopic || item.topic_tags.includes(activeTopic))
                .map((item) => (
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

            {/* Pagination */}
            <div className="mt-4 flex items-center justify-between">
              <span className={`${ts.small} text-muted-foreground`}>
                Showing {kbOffset + 1}–{Math.min(kbOffset + KB_PAGE_SIZE, kb.data.total)} of {kb.data.total}
              </span>
              <div className="flex gap-2">
                {kbOffset > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setKbOffset(Math.max(0, kbOffset - KB_PAGE_SIZE))}
                  >
                    Previous
                  </Button>
                )}
                {kbOffset + KB_PAGE_SIZE < kb.data.total && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setKbOffset(kbOffset + KB_PAGE_SIZE)}
                  >
                    Load More
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
