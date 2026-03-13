/**
 * IA Exploration — Flow-Driven Mockups
 *
 * These are throwaway screens for exploring the 37signals-inspired IA rethink.
 * They use real shadcn components but fake data — no API calls.
 *
 * Nav items and cycle nudges are wired together so you can click through
 * the full Save → Read → Ask loop and feel the flow.
 */
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  BookOpen,
  Brain,
  Check,
  ChevronRight,
  MessageSquare,
  Plus,
  Search,
  SendHorizonal,
  Zap,
} from "lucide-react";

// ─── Fake data ───────────────────────────────────────────────────────────────

const MOCK_CLUSTERS = [
  {
    id: "1",
    title: "OpenAI launches GPT-5 with native tool orchestration",
    tags: ["AI & ML", "Agentic Commerce"],
    summary:
      "OpenAI's latest model introduces built-in tool selection and multi-step planning, eliminating the need for external orchestration frameworks.",
    sources: 3,
    density: 8,
  },
  {
    id: "2",
    title: "Stripe rolls out AI-powered fraud detection for emerging markets",
    tags: ["Fintech", "AI & ML"],
    summary:
      "New ML models trained on regional transaction patterns reduce false positives by 40% in Southeast Asian markets.",
    sources: 2,
    density: 6,
  },
  {
    id: "3",
    title: "The case against microservices in 2026",
    tags: ["Architecture"],
    summary:
      "A senior Shopify engineer argues that most teams would ship faster with a modular monolith, citing real migration data.",
    sources: 1,
    density: 7,
  },
];

const FOCUSED_TOPICS = ["AI & ML", "Agentic Commerce", "US Stocks"];

type Page = "save" | "read" | "ask";

// ─── Shared layout wrapper ──────────────────────────────────────────────────

function Shell({
  active,
  onNavigate,
  children,
  unreadCount,
}: {
  active: Page;
  onNavigate: (page: Page) => void;
  children: React.ReactNode;
  unreadCount?: number;
}) {
  const navItems: { id: Page; label: string; icon: typeof Plus; badge?: number }[] = [
    { id: "save", label: "Save", icon: Plus },
    { id: "read", label: "Read", icon: BookOpen, badge: unreadCount },
    { id: "ask", label: "Ask", icon: MessageSquare },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navbar */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <button
            type="button"
            className="flex items-center gap-2"
            onClick={() => onNavigate("save")}
          >
            <Brain className="h-5 w-5 text-primary" />
            <span className="font-semibold">Distill</span>
          </button>
          <nav className="flex gap-1">
            {navItems.map((item) => (
              <Button
                key={item.id}
                variant={active === item.id ? "secondary" : "ghost"}
                size="sm"
                className="relative gap-1.5"
                onClick={() => onNavigate(item.id)}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
                {item.badge && item.badge > 0 && (
                  <Badge className="ml-1 h-5 min-w-5 justify-center rounded-full px-1.5 text-xs">
                    {item.badge}
                  </Badge>
                )}
              </Button>
            ))}
          </nav>
          <div className="w-16" /> {/* spacer for balance */}
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  );
}

// ─── Page components (shared by both options) ────────────────────────────────

function SavePageContent({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const [url, setUrl] = useState("");

  return (
    <div className="flex flex-col items-center pt-16">
      <h1 className="mb-2 text-2xl font-semibold">Save something</h1>
      <p className="mb-8 text-muted-foreground">
        Paste a link. We&apos;ll extract and queue it for your next digest.
      </p>

      <div className="flex w-full max-w-lg gap-2">
        <input
          type="url"
          placeholder="https://..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button disabled={!url.trim()}>
          <Plus className="mr-1.5 h-4 w-4" />
          Save
        </Button>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        or{" "}
        <button type="button" className="underline">
          save directly to Knowledge Base
        </button>
      </p>

      {/* Cycle nudge → Read */}
      <div className="mt-16 rounded-lg border border-dashed p-6 text-center">
        <p className="text-sm text-muted-foreground">
          You have{" "}
          <span className="font-medium text-foreground">5 articles</span>{" "}
          waiting
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => onNavigate("read")}
        >
          Catch up now
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ReadPageContent({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const focusedSet = new Set(FOCUSED_TOPICS);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = MOCK_CLUSTERS.filter((c) => !dismissed.has(c.id));

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Catch up</h1>
          <p className="text-sm text-muted-foreground">
            {visible.length} cluster{visible.length !== 1 ? "s" : ""} from today
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          Today
        </Badge>
      </div>

      {visible.length > 0 ? (
        <div className="space-y-3">
          {visible.map((cluster) => (
            <Card
              key={cluster.id}
              className="cursor-pointer transition-colors hover:bg-muted/50"
            >
              <CardContent className="py-4">
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {cluster.tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant={focusedSet.has(tag) ? "default" : "outline"}
                      className="text-xs"
                    >
                      {tag}
                    </Badge>
                  ))}
                  {cluster.sources > 1 && (
                    <Badge variant="secondary" className="text-xs">
                      {cluster.sources} sources
                    </Badge>
                  )}
                </div>
                <p className="font-medium leading-snug">{cluster.title}</p>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {cluster.summary}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setDismissed((prev) => new Set([...prev, cluster.id]))
                    }
                  >
                    <Check className="mr-1 h-3.5 w-3.5" />
                    Done
                  </Button>
                  <Button variant="ghost" size="sm">
                    <Zap className="mr-1 h-3.5 w-3.5" />
                    Save to KB
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        /* All caught up state */
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="mb-1 text-sm text-muted-foreground">All caught up!</p>
        </div>
      )}

      {/* Cycle nudge → Ask */}
      <div className="mt-8 rounded-lg border border-dashed p-6 text-center">
        <p className="text-sm text-muted-foreground">
          {visible.length === 0
            ? "Now dig deeper — ask your knowledge base a question."
            : "Want to go deeper? Ask your knowledge base."}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => onNavigate("ask")}
        >
          <Search className="mr-1.5 h-4 w-4" />
          Ask something
        </Button>
      </div>
    </>
  );
}

function AskPageContent({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const [query, setQuery] = useState("");
  const [showAnswer, setShowAnswer] = useState(false);

  return (
    <div className="flex flex-col items-center pt-12">
      <h1 className="mb-2 text-2xl font-semibold">What do you want to know?</h1>
      <p className="mb-8 text-muted-foreground">
        Ask anything about your saved articles
      </p>

      <div className="flex w-full max-w-lg gap-2">
        <input
          placeholder="e.g. What are the latest takes on agentic commerce?"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && query.trim()) setShowAnswer(true);
          }}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button
          disabled={!query.trim()}
          onClick={() => setShowAnswer(true)}
        >
          <SendHorizonal className="h-4 w-4" />
        </Button>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        12 articles indexed across 5 topics
      </p>

      {/* Mock answer */}
      {showAnswer && (
        <Card className="mt-10 w-full max-w-lg">
          <CardHeader className="pb-2">
            <p className="text-sm font-medium text-muted-foreground">Answer</p>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed">
              Based on your saved articles, agentic commerce refers to AI agents
              that autonomously execute purchase decisions on behalf of consumers.
              Stripe&apos;s new fraud detection and OpenAI&apos;s tool
              orchestration are key enablers...
            </p>
            <Separator className="my-3" />
            <p className="text-xs text-muted-foreground">
              3 sources &middot; Local LLM &middot; 2.1s
            </p>
          </CardContent>
        </Card>
      )}

      {/* Cycle nudge → Save */}
      <div className="mt-10 rounded-lg border border-dashed p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Found something new to read?
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => onNavigate("save")}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Save a link
        </Button>
      </div>
    </div>
  );
}

// ─── Option A: Intent-Based Pages (interactive) ─────────────────────────────

function OptionAFlow() {
  const [page, setPage] = useState<Page>("save");
  const unread = 3;

  return (
    <Shell active={page} onNavigate={setPage} unreadCount={unread}>
      {page === "save" && <SavePageContent onNavigate={setPage} />}
      {page === "read" && <ReadPageContent onNavigate={setPage} />}
      {page === "ask" && <AskPageContent onNavigate={setPage} />}
    </Shell>
  );
}

// ─── Option B: Adaptive Single Page (interactive) ───────────────────────────

function OptionBFlow() {
  const focusedSet = new Set(FOCUSED_TOPICS);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [showAnswer, setShowAnswer] = useState(false);

  const unread = MOCK_CLUSTERS.filter((c) => !dismissed.has(c.id));
  const hasUnread = unread.length > 0;

  // The page adapts: unread → digest-first, all caught up → ask-first
  return (
    <Shell
      active={hasUnread ? "read" : "ask"}
      onNavigate={() => {}}
      unreadCount={unread.length}
    >
      {hasUnread ? (
        <>
          {/* Primary: unread digest */}
          <div className="mb-4">
            <h1 className="text-xl font-semibold">
              {unread.length} new since yesterday
            </h1>
          </div>

          <div className="space-y-3">
            {unread.map((cluster) => (
              <Card
                key={cluster.id}
                className="cursor-pointer transition-colors hover:bg-muted/50"
              >
                <CardContent className="flex items-center gap-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap gap-1.5">
                      {cluster.tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant={focusedSet.has(tag) ? "default" : "outline"}
                          className="text-xs"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-sm font-medium leading-snug">
                      {cluster.title}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() =>
                      setDismissed((prev) => new Set([...prev, cluster.id]))
                    }
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Secondary: quick save, always available */}
          <Separator className="my-8" />
          <div className="flex items-center gap-2">
            <input
              placeholder="Paste a link to save..."
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button variant="outline" size="sm">
              <Plus className="mr-1 h-4 w-4" />
              Save
            </Button>
          </div>
        </>
      ) : (
        <>
          {/* All caught up → ask-first */}
          <div className="flex flex-col items-center pt-12">
            <p className="mb-1 text-sm text-muted-foreground">All caught up</p>
            <h1 className="mb-8 text-2xl font-semibold">
              What do you want to know?
            </h1>

            <div className="flex w-full max-w-lg gap-2">
              <input
                placeholder="Ask about your saved articles..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && query.trim()) setShowAnswer(true);
                }}
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button
                disabled={!query.trim()}
                onClick={() => setShowAnswer(true)}
              >
                <SendHorizonal className="h-4 w-4" />
              </Button>
            </div>

            {showAnswer && (
              <Card className="mt-8 w-full max-w-lg">
                <CardHeader className="pb-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    Answer
                  </p>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed">
                    Based on your saved articles, agentic commerce refers to AI
                    agents that autonomously execute purchase decisions...
                  </p>
                  <Separator className="my-3" />
                  <p className="text-xs text-muted-foreground">
                    3 sources &middot; Local LLM &middot; 2.1s
                  </p>
                </CardContent>
              </Card>
            )}

            <Separator className="my-10 w-full max-w-lg" />

            {/* Secondary: quick save */}
            <div className="flex w-full max-w-lg items-center gap-2">
              <input
                placeholder="Paste a link to save..."
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button variant="outline" size="sm">
                <Plus className="mr-1 h-4 w-4" />
                Save
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              12 articles in your knowledge base
            </p>

            {/* Reset button for demo purposes */}
            <Button
              variant="link"
              size="sm"
              className="mt-6 text-xs text-muted-foreground"
              onClick={() => {
                setDismissed(new Set());
                setShowAnswer(false);
                setQuery("");
              }}
            >
              Reset demo (bring back unread)
            </Button>
          </div>
        </>
      )}
    </Shell>
  );
}

// ─── Stories ─────────────────────────────────────────────────────────────────

const meta: Meta = {
  title: "IA Exploration/Flow Mockups",
  parameters: {
    layout: "fullscreen",
  },
};
export default meta;

type Story = StoryObj;

export const OptionA: Story = {
  name: "Option A — Intent Pages (interactive)",
  render: () => <OptionAFlow />,
};

export const OptionB: Story = {
  name: "Option B — Adaptive Single Page (interactive)",
  render: () => <OptionBFlow />,
};
