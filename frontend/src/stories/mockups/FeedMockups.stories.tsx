/**
 * Feed Feature — UX Exploration Mockups
 *
 * Exploring the unified Feed page and Settings page with feed source config.
 * Fake data, no API calls — just layout and interaction exploration.
 *
 * Screens:
 *   1. Settings — Full settings page with Feed Sources, Focused Topics, Gmail, LLM Stats sections
 *   2. Feed (empty state) — No sources configured, nudge to Settings
 *   3. Feed (scan trigger) — Fetching feed from all sources with progress
 *   4. Feed (populated) — Scrolling through ranked items (topic-matched vs other)
 *   5. Newsletter Strategy — RSS-first vs Gmail IMAP reference
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
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Globe,
  Loader2,
  Mail,
  MessageSquare,
  Plus,
  RefreshCw,
  Rss,
  Search,
  Settings,
  Trash2,
  X,
  Youtube,
} from "lucide-react";

// ─── Fake data ───────────────────────────────────────────────────────────────

const FOCUSED_TOPICS = ["AI & ML", "Distributed Systems", "Rust", "US Stocks"];

const MOCK_SOURCES = [
  {
    id: "1",
    name: "Fireship",
    type: "youtube" as const,
    url: "youtube.com/@Fireship",
    lastFetched: "2h ago",
    itemCount: 8,
  },
  {
    id: "2",
    name: "Theo - t3.gg",
    type: "youtube" as const,
    url: "youtube.com/@t3dotgg",
    lastFetched: "2h ago",
    itemCount: 12,
  },
  {
    id: "3",
    name: "TechCrunch",
    type: "rss" as const,
    url: "techcrunch.com/feed",
    lastFetched: "2h ago",
    itemCount: 25,
  },
  {
    id: "4",
    name: "Simon Willison",
    type: "rss" as const,
    url: "simonwillison.net/atom/everything",
    lastFetched: "2h ago",
    itemCount: 6,
  },
  {
    id: "5",
    name: "TLDR",
    type: "rss" as const,
    url: "tldr.tech/api/rss/tech",
    lastFetched: "2h ago",
    itemCount: 15,
  },
];

const MOCK_NEWSLETTER_SOURCES = [
  {
    name: "TLDR Tech",
    email: "dan@tldrnewsletter.com",
    rssAvailable: true,
    rssUrl: "tldr.tech/api/rss/tech",
    platform: "Custom",
  },
  {
    name: "ByteByteGo",
    email: "newsletter@blog.bytebytego.com",
    rssAvailable: true,
    rssUrl: "blog.bytebytego.com/feed",
    platform: "Substack",
  },
  {
    name: "The Pragmatic Engineer",
    email: "newsletter@pragmaticengineer.com",
    rssAvailable: true,
    rssUrl: "newsletter.pragmaticengineer.com/feed",
    platform: "Substack",
  },
  {
    name: "Yahoo Finance Daily",
    email: "newsletter@mail.yahoo.com",
    rssAvailable: false,
    rssUrl: null,
    platform: "Email-only",
  },
  {
    name: "Dense Discovery",
    email: "kai@densediscovery.com",
    rssAvailable: false,
    rssUrl: null,
    platform: "Email-only",
  },
];

interface FeedItem {
  id: string;
  title: string;
  sourceName: string;
  sourceType: "youtube" | "rss" | "newsletter";
  topicTags: string[];
  matchScore: number;
  description: string;
  publishedAt: string;
  publishedDate: Date;
  url: string;
  thumbnail?: string;
  hasSummary: boolean;
}

// Helper to create dates relative to "now" for the mockup
const MOCK_NOW = new Date(2026, 2, 16, 14, 0, 0); // Mar 16 2026, 2pm
const hoursAgo = (h: number) => new Date(MOCK_NOW.getTime() - h * 3600_000);
const daysAgo = (d: number, h = 10) => new Date(MOCK_NOW.getTime() - (d * 24 + h) * 3600_000);

const MOCK_FEED_ITEMS: FeedItem[] = [
  // ── Today ──
  {
    id: "f1",
    title: "I built a AI agent that mass-buys my groceries",
    sourceName: "Fireship",
    sourceType: "youtube",
    topicTags: ["AI & ML", "Web Dev"],
    matchScore: 1,
    description:
      "A fast-paced walkthrough of building an autonomous shopping agent using GPT-5's tool orchestration API, Playwright for browser automation, and a Rust backend for speed.",
    publishedAt: "3h ago",
    publishedDate: hoursAgo(3),
    url: "https://youtube.com/watch?v=abc123",
    thumbnail: "",
    hasSummary: false,
  },
  {
    id: "f6",
    title: "Why I Switched from VS Code to Zed",
    sourceName: "Theo - t3.gg",
    sourceType: "youtube",
    topicTags: ["Developer Tools"],
    matchScore: 0,
    description:
      "After 3 months with Zed as my daily driver, here's what I love, what I miss, and why I'm not going back.",
    publishedAt: "1h ago",
    publishedDate: hoursAgo(1),
    url: "https://youtube.com/watch?v=ghi789",
    thumbnail: "",
    hasSummary: false,
  },
  {
    id: "f2",
    title: "Rust 2025 Edition: What's Actually New",
    sourceName: "Theo - t3.gg",
    sourceType: "youtube",
    topicTags: ["Rust", "Programming Languages"],
    matchScore: 1,
    description:
      "Breaking down the Rust 2025 edition changes — new borrow checker improvements, async closures stabilized, and the controversial decision to add optional GC.",
    publishedAt: "5h ago",
    publishedDate: hoursAgo(5),
    url: "https://youtube.com/watch?v=def456",
    thumbnail: "",
    hasSummary: false,
  },
  {
    id: "f4",
    title: "NVIDIA Stock Surges 12% on AI Infrastructure Demand",
    sourceName: "TLDR",
    sourceType: "rss",
    topicTags: ["US Stocks", "AI & ML"],
    matchScore: 2,
    description:
      "NVIDIA's Q1 earnings beat expectations with $42B revenue driven by hyperscaler AI infrastructure spending. Stock hits new ATH.",
    publishedAt: "6h ago",
    publishedDate: hoursAgo(6),
    url: "https://tldr.tech/tech/nvidia-q1-2026",
    hasSummary: false,
  },
  {
    id: "f7",
    title: "Apple Announces M5 Ultra with 512GB Unified Memory",
    sourceName: "TechCrunch",
    sourceType: "rss",
    topicTags: ["Hardware", "Apple"],
    matchScore: 0,
    description:
      "The new M5 Ultra targets AI workstation users with 512GB unified memory and a 128-core Neural Engine.",
    publishedAt: "4h ago",
    publishedDate: hoursAgo(4),
    url: "https://techcrunch.com/2026/03/16/m5-ultra",
    hasSummary: false,
  },
  // ── Yesterday ──
  {
    id: "f3",
    title: "The Architecture Behind Bluesky's Federation",
    sourceName: "Simon Willison",
    sourceType: "rss",
    topicTags: ["Distributed Systems", "Architecture"],
    matchScore: 1,
    description:
      "Detailed analysis of Bluesky's AT Protocol, comparing its federation model to ActivityPub and examining the trade-offs in their distributed data architecture.",
    publishedAt: "1d ago",
    publishedDate: daysAgo(1, 6),
    url: "https://simonwillison.net/2026/Mar/15/bluesky-federation",
    hasSummary: false,
  },
  {
    id: "f5",
    title:
      "Building Reliable Distributed Systems with Deterministic Simulation Testing",
    sourceName: "ByteByteGo",
    sourceType: "newsletter",
    topicTags: ["Distributed Systems", "Testing"],
    matchScore: 1,
    description:
      "How TigerBeetle and FoundationDB use deterministic simulation to test distributed consensus without flaky integration tests.",
    publishedAt: "1d ago",
    publishedDate: daysAgo(1, 2),
    url: "https://blog.bytebytego.com/p/deterministic-simulation",
    hasSummary: true,
  },
  {
    id: "f9",
    title: "CSS Container Queries Are Finally Mainstream",
    sourceName: "TechCrunch",
    sourceType: "rss",
    topicTags: ["Web Dev", "CSS"],
    matchScore: 0,
    description:
      "With Safari 20 adding full support, container queries now work across all major browsers. Here's how to migrate from media queries.",
    publishedAt: "1d ago",
    publishedDate: daysAgo(1, 7),
    url: "https://techcrunch.com/2026/03/15/css-container-queries",
    hasSummary: false,
  },
  {
    id: "f11",
    title: "How Discord Scaled to 200M Users with Rust",
    sourceName: "Fireship",
    sourceType: "youtube",
    topicTags: ["Rust", "Distributed Systems"],
    matchScore: 2,
    description:
      "Discord's journey from Go to Rust for their Read States service, reducing tail latencies from 2s to 50ms and halving memory usage.",
    publishedAt: "1d ago",
    publishedDate: daysAgo(1, 4),
    url: "https://youtube.com/watch?v=jkl012",
    thumbnail: "",
    hasSummary: false,
  },
  // ── This week (2-6 days ago) ──
  {
    id: "f8",
    title: "The End of the Junior Developer?",
    sourceName: "The Pragmatic Engineer",
    sourceType: "newsletter",
    topicTags: ["Career", "AI & ML"],
    matchScore: 1,
    description:
      "Analyzing hiring data from 200 companies: junior roles down 35% YoY, but mid-level roles with AI skills are up 60%.",
    publishedAt: "3d ago",
    publishedDate: daysAgo(3),
    url: "https://newsletter.pragmaticengineer.com/p/junior-developer-2026",
    hasSummary: true,
  },
  {
    id: "f10",
    title: "Cloudflare Workers Now Support WebGPU",
    sourceName: "Simon Willison",
    sourceType: "rss",
    topicTags: ["Edge Computing", "Web Dev"],
    matchScore: 0,
    description:
      "Cloudflare's edge runtime adds WebGPU support, enabling ML inference at the edge without cold starts. Early benchmarks show 3x faster than WASM approach.",
    publishedAt: "4d ago",
    publishedDate: daysAgo(4),
    url: "https://simonwillison.net/2026/Mar/12/cloudflare-webgpu",
    hasSummary: false,
  },
  {
    id: "f12",
    title: "Tesla Q1 Delivery Numbers Miss Estimates",
    sourceName: "TLDR",
    sourceType: "rss",
    topicTags: ["US Stocks", "EVs"],
    matchScore: 1,
    description:
      "Tesla delivered 387K vehicles in Q1 2026, below the 410K consensus estimate. Stock drops 8% in after-hours trading.",
    publishedAt: "5d ago",
    publishedDate: daysAgo(5),
    url: "https://tldr.tech/tech/tesla-q1-deliveries",
    hasSummary: false,
  },
  // ── Older (7+ days) ──
  {
    id: "f13",
    title: "SQLite Turns 25: The Most Deployed Database",
    sourceName: "Simon Willison",
    sourceType: "rss",
    topicTags: ["Databases", "Architecture"],
    matchScore: 0,
    description:
      "A retrospective on SQLite's 25 years: from Tcl extension to the most widely deployed database engine, now used in aircraft flight software.",
    publishedAt: "8d ago",
    publishedDate: daysAgo(8),
    url: "https://simonwillison.net/2026/Mar/08/sqlite-25",
    hasSummary: false,
  },
  {
    id: "f14",
    title: "Practical Guide to RAFT Consensus",
    sourceName: "ByteByteGo",
    sourceType: "newsletter",
    topicTags: ["Distributed Systems"],
    matchScore: 1,
    description:
      "Visual walkthrough of RAFT leader election, log replication, and safety proofs with practical implementation tips for production systems.",
    publishedAt: "10d ago",
    publishedDate: daysAgo(10),
    url: "https://blog.bytebytego.com/p/raft-consensus-guide",
    hasSummary: true,
  },
];

// ─── Shared layout ───────────────────────────────────────────────────────────

type Page = "feed" | "settings" | "save" | "read" | "ask";

function Shell({
  active,
  onNavigate,
  children,
  feedCount,
}: {
  active: Page;
  onNavigate: (page: Page) => void;
  children: React.ReactNode;
  feedCount?: number;
}) {
  const navItems: {
    id: Page;
    label: string;
    icon: typeof Plus;
    badge?: number;
  }[] = [
    { id: "save", label: "Save", icon: Plus },
    { id: "read", label: "Read", icon: BookOpen },
    { id: "feed", label: "Feed", icon: Rss, badge: feedCount },
    { id: "ask", label: "Ask", icon: MessageSquare },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <button
            type="button"
            className="flex items-center gap-2"
            onClick={() => onNavigate("feed")}
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
                <span className="hidden sm:inline">{item.label}</span>
                {item.badge && item.badge > 0 && (
                  <Badge className="ml-1 h-5 min-w-5 justify-center rounded-full px-1.5 text-xs">
                    {item.badge}
                  </Badge>
                )}
              </Button>
            ))}
            {/* Settings gear icon */}
            <Button
              variant={active === "settings" ? "secondary" : "ghost"}
              size="icon"
              className="ml-2 h-8 w-8"
              onClick={() => onNavigate("settings")}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  );
}

// ─── Source type helpers ─────────────────────────────────────────────────────

function SourceTypeIcon({
  type,
  className = "h-4 w-4",
}: {
  type: "youtube" | "rss" | "newsletter";
  className?: string;
}) {
  switch (type) {
    case "youtube":
      return <Youtube className={`${className} text-red-500`} />;
    case "newsletter":
      return <Mail className={`${className} text-blue-500`} />;
    case "rss":
      return <Globe className={`${className} text-orange-500`} />;
  }
}

function SourceTypeBadge({ type }: { type: "youtube" | "rss" | "newsletter" }) {
  const colors = {
    youtube: "bg-red-500/10 text-red-600 dark:text-red-400",
    rss: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    newsletter: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  };
  const labels = { youtube: "YouTube", rss: "RSS", newsletter: "Newsletter" };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${colors[type]}`}
    >
      <SourceTypeIcon type={type} className="h-3 w-3" />
      {labels[type]}
    </span>
  );
}

// ─── Screen 1: Settings Page ─────────────────────────────────────────────────

function SettingsScreen() {
  const [page, setPage] = useState<Page>("settings");
  const [sources, setSources] = useState(MOCK_SOURCES);
  const [topics, setTopics] = useState(FOCUSED_TOPICS);
  const [inputUrl, setInputUrl] = useState("");
  const [topicInput, setTopicInput] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState<{
    name: string;
    type: "youtube" | "rss";
    feedUrl: string;
  } | null>(null);

  const handleDetect = () => {
    if (!inputUrl.trim()) return;
    setDetecting(true);
    setTimeout(() => {
      setDetecting(false);
      if (
        inputUrl.includes("youtube.com") ||
        inputUrl.includes("youtu.be") ||
        inputUrl.includes("@")
      ) {
        setDetected({
          name: "3Blue1Brown",
          type: "youtube",
          feedUrl:
            "youtube.com/feeds/videos.xml?channel_id=UCYO_jab_esuFRV4b17AJtAw",
        });
      } else {
        setDetected({
          name: "Hacker News",
          type: "rss",
          feedUrl: "news.ycombinator.com/rss",
        });
      }
    }, 1200);
  };

  const handleAddSource = () => {
    if (!detected) return;
    setSources((prev) => [
      ...prev,
      {
        id: String(prev.length + 1),
        name: detected.name,
        type: detected.type,
        url: detected.feedUrl,
        lastFetched: "never",
        itemCount: 0,
      },
    ]);
    setInputUrl("");
    setDetected(null);
  };

  const handleAddTopic = () => {
    const t = topicInput.trim();
    if (t && !topics.includes(t)) {
      setTopics((prev) => [...prev, t]);
    }
    setTopicInput("");
  };

  return (
    <Shell active={page} onNavigate={setPage} feedCount={42}>
      <h1 className="mb-6 text-xl font-semibold">Settings</h1>

      {/* ═══ Section 1: Feed Sources ═══ */}
      <section id="feed-sources" className="mb-10">
        <div className="mb-4 flex items-center gap-2">
          <Rss className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Feed Sources</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          YouTube channels, blogs, and news sites to scan for your interests.
          Up to 25 items fetched per source.
        </p>

        {/* Add source input */}
        <Card className="mb-4">
          <CardContent className="pt-6">
            <label className="mb-2 block text-sm font-medium">
              Add a source
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                placeholder="Paste a YouTube channel, blog, or RSS feed URL..."
                value={inputUrl}
                onChange={(e) => {
                  setInputUrl(e.target.value);
                  setDetected(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleDetect();
                }}
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button
                onClick={handleDetect}
                disabled={!inputUrl.trim() || detecting}
              >
                {detecting ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    Detecting...
                  </>
                ) : (
                  <>
                    <Search className="mr-1.5 h-4 w-4" />
                    Detect
                  </>
                )}
              </Button>
            </div>

            {detected && (
              <div className="mt-4 flex items-center justify-between rounded-lg border border-dashed p-4">
                <div className="flex items-center gap-3">
                  <SourceTypeIcon type={detected.type} className="h-5 w-5" />
                  <div>
                    <p className="text-sm font-medium">{detected.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {detected.feedUrl}
                    </p>
                  </div>
                  <SourceTypeBadge type={detected.type} />
                </div>
                <Button size="sm" onClick={handleAddSource}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add
                </Button>
              </div>
            )}

            <p className="mt-3 text-xs text-muted-foreground">
              Paste any URL — we&apos;ll auto-detect the feed type. YouTube
              channels, Substack, WordPress, and most blogs with RSS are
              supported.
            </p>
          </CardContent>
        </Card>

        {/* Source list */}
        {sources.length > 0 ? (
          <div className="space-y-2">
            {sources.map((source) => (
              <div
                key={source.id}
                className="flex items-center justify-between rounded-lg border px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <SourceTypeIcon type={source.type} className="h-5 w-5" />
                  <div>
                    <p className="text-sm font-medium">{source.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {source.url}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right text-xs text-muted-foreground">
                    <p>{source.itemCount} items</p>
                    <p>
                      {source.lastFetched === "never"
                        ? "Never fetched"
                        : `Updated ${source.lastFetched}`}
                    </p>
                  </div>
                  <SourceTypeBadge type={source.type} />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() =>
                      setSources((prev) =>
                        prev.filter((s) => s.id !== source.id)
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            <p className="pt-2 text-center text-xs text-muted-foreground">
              {sources.length} source{sources.length !== 1 ? "s" : ""}{" "}
              configured
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No sources configured yet. Add a YouTube channel or blog URL
              above.
            </p>
          </div>
        )}
      </section>

      <Separator className="mb-10" />

      {/* ═══ Section 2: Focused Topics ═══ */}
      <section id="focused-topics" className="mb-10">
        <div className="mb-4 flex items-center gap-2">
          <Search className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Focused Topics</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Topics you care about. Used to rank your Feed, sort digest clusters,
          and focus RAG answers.
        </p>

        <div className="mb-4 flex gap-2">
          <input
            placeholder="Add a topic..."
            value={topicInput}
            onChange={(e) => setTopicInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddTopic();
            }}
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button
            onClick={handleAddTopic}
            disabled={!topicInput.trim()}
            size="sm"
          >
            <Plus className="mr-1 h-4 w-4" />
            Add
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {topics.map((topic) => (
            <Badge key={topic} variant="default" className="gap-1 pr-1 text-sm">
              {topic}
              <button
                type="button"
                className="ml-1 rounded-full p-0.5 hover:bg-primary-foreground/20"
                onClick={() =>
                  setTopics((prev) => prev.filter((t) => t !== topic))
                }
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
        {topics.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            {topics.length} topic{topics.length !== 1 ? "s" : ""} &middot; Max
            20
          </p>
        )}
      </section>

      <Separator className="mb-10" />

      {/* ═══ Section 3: Gmail Newsletter (IMAP) ═══ */}
      <section id="gmail" className="mb-10">
        <div className="mb-4 flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Gmail Newsletters</h2>
          <Badge variant="outline" className="text-xs">
            Optional
          </Badge>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          For email-only newsletters that don&apos;t have an RSS feed. Connects
          to a dedicated Gmail inbox via IMAP.{" "}
          <span className="font-medium text-foreground">
            Prefer adding newsletters as RSS sources when possible
          </span>{" "}
          — it&apos;s simpler and more reliable.
        </p>

        <Card>
          <CardContent className="pt-6">
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Gmail Address
                </label>
                <input
                  type="email"
                  value="distill.agent@gmail.com"
                  readOnly
                  className="w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  App Password
                </label>
                <input
                  type="password"
                  value="••••••••••••••••"
                  readOnly
                  className="w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-sm"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Configured via <code>.env</code> (GMAIL_ADDRESS,
                GMAIL_APP_PASSWORD). Every email in this inbox is treated as a
                newsletter.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <Separator className="mb-10" />

      {/* ═══ Section 4: LLM Stats (placeholder) ═══ */}
      <section id="stats" className="mb-10">
        <div className="mb-4 flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">LLM Usage</h2>
        </div>
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Cost tracking, token usage, and provider stats would go here.
            <br />
            <span className="text-xs">(Currently on the Capture page)</span>
          </CardContent>
        </Card>
      </section>
    </Shell>
  );
}

// ─── Screen 2: Feed — Empty State (no sources configured) ───────────────────

function FeedEmptyScreen() {
  const [page, setPage] = useState<Page>("feed");

  return (
    <Shell active={page} onNavigate={setPage}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Feed</h1>
          <p className="text-sm text-muted-foreground">
            Your personalized content feed
          </p>
        </div>
        <Button disabled>
          <RefreshCw className="mr-1.5 h-4 w-4" />
          Fetch Feed
        </Button>
      </div>

      {/* Empty state with nudge to Settings */}
      <div className="rounded-lg border border-dashed p-10 text-center">
        <Rss className="mx-auto mb-4 h-10 w-10 text-muted-foreground/50" />
        <p className="mb-2 text-sm font-medium">No feed sources configured</p>
        <p className="mb-6 text-sm text-muted-foreground">
          Add YouTube channels, blogs, or news sites to start scanning for
          content that matches your interests.
        </p>
        <Button onClick={() => setPage("settings")}>
          <Settings className="mr-1.5 h-4 w-4" />
          Set up Feed Sources
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">
          Go to{" "}
          <button
            type="button"
            className="font-medium underline"
            onClick={() => setPage("settings")}
          >
            Settings &rarr; Feed Sources
          </button>{" "}
          to add your first source
        </p>
      </div>

      {/* Also nudge focused topics if empty */}
      <div className="mt-6 rounded-lg border bg-muted/30 p-4 text-center">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Tip:</span> Set up your{" "}
          <button
            type="button"
            className="font-medium underline"
            onClick={() => setPage("settings")}
          >
            Focused Topics
          </button>{" "}
          too — the feed ranks content that matches your interests higher.
        </p>
      </div>
    </Shell>
  );
}

// ─── Screen 3: Feed — Scan Trigger (sources configured) ─────────────────────

function FeedScanScreen() {
  const [page, setPage] = useState<Page>("feed");
  const [scanState, setScanState] = useState<"idle" | "scanning" | "done">(
    "idle"
  );
  const [progress, setProgress] = useState({
    current: 0,
    total: 5,
    source: "",
  });
  const [expandedLog, setExpandedLog] = useState(false);

  const handleScan = () => {
    setScanState("scanning");
    const sources = [
      "Fireship",
      "Theo - t3.gg",
      "TechCrunch",
      "Simon Willison",
      "TLDR",
    ];
    sources.forEach((source, i) => {
      setTimeout(() => {
        setProgress({ current: i + 1, total: sources.length, source });
        if (i === sources.length - 1) {
          setTimeout(() => setScanState("done"), 800);
        }
      }, (i + 1) * 900);
    });
  };

  return (
    <Shell active={page} onNavigate={setPage}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Feed</h1>
          <p className="text-sm text-muted-foreground">
            {scanState === "idle" && (
              <>
                5 sources configured &middot;{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => setPage("settings")}
                >
                  Edit
                </button>
                {" "}&middot; Last fetched 2h ago
              </>
            )}
            {scanState === "scanning" && "Scanning sources..."}
            {scanState === "done" && "Scan complete — 18 new items found"}
          </p>
        </div>
        <Button onClick={handleScan} disabled={scanState === "scanning"}>
          {scanState === "scanning" ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              Scanning...
            </>
          ) : (
            <>
              <RefreshCw className="mr-1.5 h-4 w-4" />
              Fetch Feed
            </>
          )}
        </Button>
      </div>

      {/* Progress bar */}
      {scanState === "scanning" && (
        <Card className="mb-6">
          <CardContent className="py-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Scanning:{" "}
                <span className="font-medium text-foreground">
                  {progress.source}
                </span>
              </span>
              <span className="text-muted-foreground">
                {progress.current}/{progress.total} sources
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{
                  width: `${(progress.current / progress.total) * 100}%`,
                }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Fetching up to 25 items per source, then tagging topics...
            </p>
          </CardContent>
        </Card>
      )}

      {/* Completion summary */}
      {scanState === "done" && (
        <Card className="mb-6 border-green-200 dark:border-green-900">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
              <Check className="h-4 w-4" />
              Scan complete
            </div>
            <div className="mt-2 grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-lg font-semibold">18</p>
                <p className="text-xs text-muted-foreground">New items</p>
              </div>
              <div>
                <p className="text-lg font-semibold">7</p>
                <p className="text-xs text-muted-foreground">Topic matches</p>
              </div>
              <div>
                <p className="text-lg font-semibold">5</p>
                <p className="text-xs text-muted-foreground">Sources scanned</p>
              </div>
            </div>

            <button
              type="button"
              className="mt-3 flex w-full items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setExpandedLog(!expandedLog)}
            >
              {expandedLog ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              Scan details
            </button>
            {expandedLog && (
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                <p>
                  <SourceTypeIcon
                    type="youtube"
                    className="mr-1 inline h-3 w-3"
                  />
                  Fireship — 4 new (2 matched)
                </p>
                <p>
                  <SourceTypeIcon
                    type="youtube"
                    className="mr-1 inline h-3 w-3"
                  />
                  Theo - t3.gg — 3 new (1 matched)
                </p>
                <p>
                  <SourceTypeIcon
                    type="rss"
                    className="mr-1 inline h-3 w-3"
                  />
                  TechCrunch — 6 new (1 matched)
                </p>
                <p>
                  <SourceTypeIcon
                    type="rss"
                    className="mr-1 inline h-3 w-3"
                  />
                  Simon Willison — 2 new (1 matched)
                </p>
                <p>
                  <SourceTypeIcon
                    type="rss"
                    className="mr-1 inline h-3 w-3"
                  />
                  TLDR — 3 new (2 matched)
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Placeholder feed items */}
      <div className="space-y-3 opacity-40">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="py-4">
              <div className="mb-2 h-3 w-24 rounded bg-muted" />
              <div className="mb-1 h-4 w-3/4 rounded bg-muted" />
              <div className="h-3 w-full rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    </Shell>
  );
}

// ─── Screen 4: Feed View (populated, ranked) ────────────────────────────────

function FeedViewScreen() {
  const [page, setPage] = useState<Page>("feed");
  const [readItems, setReadItems] = useState<Set<string>>(new Set());
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);

  const focusedSet = new Set(FOCUSED_TOPICS);

  const filteredItems = sourceFilter
    ? MOCK_FEED_ITEMS.filter((item) => item.sourceType === sourceFilter)
    : MOCK_FEED_ITEMS;

  const matchingItems = filteredItems
    .filter((item) => item.matchScore > 0 && !readItems.has(item.id))
    .sort((a, b) => b.matchScore - a.matchScore);

  const otherItems = filteredItems.filter(
    (item) => item.matchScore === 0 && !readItems.has(item.id)
  );

  const markRead = (id: string) => {
    setReadItems((prev) => new Set([...prev, id]));
  };

  const FeedItemCard = ({ item }: { item: FeedItem }) => (
    <Card className="transition-colors hover:bg-muted/50">
      <CardContent className="py-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SourceTypeIcon type={item.sourceType} className="h-4 w-4" />
            <span className="text-xs font-medium text-muted-foreground">
              {item.sourceName}
            </span>
            <SourceTypeBadge type={item.sourceType} />
          </div>
          <span className="text-xs text-muted-foreground">
            {item.publishedAt}
          </span>
        </div>

        <p className="font-medium leading-snug">{item.title}</p>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.topicTags.map((tag) => (
            <Badge
              key={tag}
              variant={focusedSet.has(tag) ? "default" : "outline"}
              className="text-xs"
            >
              {tag}
            </Badge>
          ))}
          {item.hasSummary && (
            <Badge variant="secondary" className="text-xs">
              Summarized
            </Badge>
          )}
        </div>

        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {item.description}
        </p>

        <div className="mt-3 flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => markRead(item.id)}>
            <Check className="mr-1 h-3.5 w-3.5" />
            Done
          </Button>
          <Button variant="ghost" size="sm">
            <BookOpen className="mr-1 h-3.5 w-3.5" />
            Add to Digest
          </Button>
          <Button variant="ghost" size="sm">
            <Brain className="mr-1 h-3.5 w-3.5" />
            Save to KB
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <Shell active={page} onNavigate={setPage} feedCount={matchingItems.length}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Feed</h1>
          <p className="text-sm text-muted-foreground">
            {matchingItems.length + otherItems.length} items from{" "}
            {MOCK_SOURCES.length} sources &middot;{" "}
            <button
              type="button"
              className="underline"
              onClick={() => setPage("settings")}
            >
              Edit
            </button>
            {" "}&middot; Updated 2h ago
          </p>
        </div>
        <Button>
          <RefreshCw className="mr-1.5 h-4 w-4" />
          Fetch Feed
        </Button>
      </div>

      {/* Source type filters */}
      <div className="mb-6 flex gap-2">
        <Button
          variant={sourceFilter === null ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setSourceFilter(null)}
        >
          All
        </Button>
        <Button
          variant={sourceFilter === "youtube" ? "secondary" : "ghost"}
          size="sm"
          onClick={() =>
            setSourceFilter(sourceFilter === "youtube" ? null : "youtube")
          }
        >
          <Youtube className="mr-1.5 h-3.5 w-3.5 text-red-500" />
          YouTube
        </Button>
        <Button
          variant={sourceFilter === "rss" ? "secondary" : "ghost"}
          size="sm"
          onClick={() =>
            setSourceFilter(sourceFilter === "rss" ? null : "rss")
          }
        >
          <Globe className="mr-1.5 h-3.5 w-3.5 text-orange-500" />
          RSS
        </Button>
        <Button
          variant={sourceFilter === "newsletter" ? "secondary" : "ghost"}
          size="sm"
          onClick={() =>
            setSourceFilter(
              sourceFilter === "newsletter" ? null : "newsletter"
            )
          }
        >
          <Mail className="mr-1.5 h-3.5 w-3.5 text-blue-500" />
          Newsletter
        </Button>
      </div>

      {/* Matching your topics */}
      {matchingItems.length > 0 && (
        <>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-semibold">Matching Your Topics</h2>
            <Badge variant="default" className="text-xs">
              {matchingItems.length}
            </Badge>
          </div>
          <div className="space-y-3">
            {matchingItems.map((item) => (
              <FeedItemCard key={item.id} item={item} />
            ))}
          </div>
        </>
      )}

      {/* Other from your sources */}
      {otherItems.length > 0 && (
        <>
          <Separator className="my-6" />
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Other from Your Sources
            </h2>
            <Badge variant="outline" className="text-xs">
              {otherItems.length}
            </Badge>
          </div>
          <div className="space-y-3">
            {otherItems.map((item) => (
              <FeedItemCard key={item.id} item={item} />
            ))}
          </div>
        </>
      )}

      {/* All caught up */}
      {matchingItems.length === 0 && otherItems.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="mb-1 text-sm font-medium">All caught up!</p>
          <p className="text-xs text-muted-foreground">
            No unread items in your feed.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => setReadItems(new Set())}
          >
            Reset demo (mark all unread)
          </Button>
        </div>
      )}
    </Shell>
  );
}

// ─── Screen 5: Newsletter Strategy Reference ─────────────────────────────────

function NewsletterStrategyScreen() {
  const [page, setPage] = useState<Page>("settings");

  return (
    <Shell active={page} onNavigate={setPage}>
      <div className="mb-8">
        <h1 className="text-xl font-semibold">Newsletter Sources</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How the system handles email newsletters — RSS-first, Gmail IMAP as
          fallback.
        </p>
      </div>

      <Card className="mb-8 border-blue-200 dark:border-blue-900">
        <CardHeader className="pb-2">
          <p className="text-sm font-semibold">
            Recommended: Add newsletters as RSS sources when possible
          </p>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Many newsletters publish RSS feeds (Substack, Ghost, Beehiiv, etc.).
            Adding them as RSS sources is simpler, more reliable, and
            doesn&apos;t require Gmail credentials. Use Gmail IMAP only for
            email-only newsletters that don&apos;t have a web feed.
          </p>
        </CardContent>
      </Card>

      <div className="mb-4">
        <h2 className="text-sm font-semibold">
          Common newsletters and their best integration method
        </h2>
      </div>

      <div className="space-y-2">
        {MOCK_NEWSLETTER_SOURCES.map((nl) => (
          <div
            key={nl.name}
            className="flex items-center justify-between rounded-lg border px-4 py-3"
          >
            <div className="flex items-center gap-3">
              {nl.rssAvailable ? (
                <Globe className="h-5 w-5 text-orange-500" />
              ) : (
                <Mail className="h-5 w-5 text-blue-500" />
              )}
              <div>
                <p className="text-sm font-medium">{nl.name}</p>
                <p className="text-xs text-muted-foreground">
                  {nl.rssAvailable ? nl.rssUrl : nl.email}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                variant={nl.rssAvailable ? "outline" : "secondary"}
                className="text-xs"
              >
                {nl.platform}
              </Badge>
              {nl.rssAvailable ? (
                <Button size="sm" variant="outline">
                  <Rss className="mr-1.5 h-3.5 w-3.5" />
                  Add as RSS
                </Button>
              ) : (
                <Button size="sm" variant="secondary">
                  <Mail className="mr-1.5 h-3.5 w-3.5" />
                  Needs Gmail
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <Separator className="my-8" />

      <div className="rounded-lg bg-muted/50 p-4">
        <p className="text-xs font-medium">
          How Gmail newsletters are processed:
        </p>
        <ol className="mt-2 space-y-1 text-xs text-muted-foreground">
          <li>1. Fetch unread emails via IMAP</li>
          <li>
            2. Multi-item newsletters (TLDR, Morning Brew) are split into
            individual entries
          </li>
          <li>
            3. Each item is fully summarized (unlike RSS items — email body has
            the full text)
          </li>
          <li>4. Items appear in your Feed alongside RSS items</li>
          <li>5. Gmail messages are marked as read after processing</li>
        </ol>
      </div>
    </Shell>
  );
}

// ─── Date grouping helpers ────────────────────────────────────────────────────

type DateGroup = { label: string; items: FeedItem[] };

function groupByDate(items: FeedItem[], now: Date = MOCK_NOW): DateGroup[] {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const todayStart = startOfDay(now);
  const yesterdayStart = new Date(todayStart.getTime() - 86400_000);
  const weekStart = new Date(todayStart.getTime() - 6 * 86400_000);

  const buckets: Record<string, FeedItem[]> = {
    Today: [],
    Yesterday: [],
    "This Week": [],
    Older: [],
  };

  for (const item of items) {
    const d = item.publishedDate;
    if (d >= todayStart) buckets["Today"].push(item);
    else if (d >= yesterdayStart) buckets["Yesterday"].push(item);
    else if (d >= weekStart) buckets["This Week"].push(item);
    else buckets["Older"].push(item);
  }

  // Sort within each bucket: topic-matched first, then by recency
  const sortBucket = (a: FeedItem, b: FeedItem) => {
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
    return b.publishedDate.getTime() - a.publishedDate.getTime();
  };

  return Object.entries(buckets)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items: items.sort(sortBucket) }));
}

function formatRelativeTime(d: Date, now: Date = MOCK_NOW): string {
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / 3600_000);
  if (diffH < 1) return "just now";
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "yesterday";
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Screen 6: Feed with Left Sidebar Navigation ───────────────────────────

function FeedLeftNavScreen() {
  const [page, setPage] = useState<Page>("feed");
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Compute counts per source
  const sourceCounts = MOCK_SOURCES.reduce(
    (acc, s) => {
      acc[s.id] = MOCK_FEED_ITEMS.filter(
        (i) => i.sourceName === s.name && !dismissed.has(i.id),
      ).length;
      return acc;
    },
    {} as Record<string, number>,
  );

  const typeCounts = {
    youtube: MOCK_FEED_ITEMS.filter((i) => i.sourceType === "youtube" && !dismissed.has(i.id)).length,
    rss: MOCK_FEED_ITEMS.filter((i) => i.sourceType === "rss" && !dismissed.has(i.id)).length,
    newsletter: MOCK_FEED_ITEMS.filter((i) => i.sourceType === "newsletter" && !dismissed.has(i.id)).length,
  };

  // Filter items
  const filtered = MOCK_FEED_ITEMS.filter((item) => {
    if (dismissed.has(item.id)) return false;
    if (selectedSource) {
      const source = MOCK_SOURCES.find((s) => s.id === selectedSource);
      if (source && item.sourceName !== source.name) return false;
    }
    if (selectedType && item.sourceType !== selectedType) return false;
    return true;
  });

  const totalUnread = MOCK_FEED_ITEMS.filter((i) => !dismissed.has(i.id)).length;
  const dateGroups = groupByDate(filtered);
  const matchingCount = filtered.filter((i) => i.matchScore > 0).length;

  return (
    <Shell active={page} onNavigate={setPage} feedCount={totalUnread}>
      <div className="flex gap-6">
        {/* Left sidebar */}
        <aside className="hidden w-56 shrink-0 md:block">
          <div className="sticky top-20 space-y-1">
            {/* All items */}
            <button
              type="button"
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
                !selectedSource && !selectedType
                  ? "bg-secondary font-medium"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
              onClick={() => {
                setSelectedSource(null);
                setSelectedType(null);
              }}
            >
              <span className="flex items-center gap-2">
                <Rss className="h-4 w-4" />
                All Sources
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {totalUnread}
              </span>
            </button>

            <Separator className="my-2" />

            {/* By type */}
            <p className="px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              By Type
            </p>
            {(
              [
                { type: "youtube", label: "YouTube", icon: Youtube, color: "text-red-500" },
                { type: "rss", label: "RSS", icon: Globe, color: "text-orange-500" },
                { type: "newsletter", label: "Newsletters", icon: Mail, color: "text-blue-500" },
              ] as const
            ).map((t) => (
              <button
                key={t.type}
                type="button"
                className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors ${
                  selectedType === t.type && !selectedSource
                    ? "bg-secondary font-medium"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
                onClick={() => {
                  setSelectedType(selectedType === t.type ? null : t.type);
                  setSelectedSource(null);
                }}
              >
                <span className="flex items-center gap-2">
                  <t.icon className={`h-3.5 w-3.5 ${t.color}`} />
                  {t.label}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {typeCounts[t.type]}
                </span>
              </button>
            ))}

            <Separator className="my-2" />

            {/* By source */}
            <p className="px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Sources
            </p>
            {MOCK_SOURCES.map((source) => (
              <button
                key={source.id}
                type="button"
                className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors ${
                  selectedSource === source.id
                    ? "bg-secondary font-medium"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
                onClick={() => {
                  setSelectedSource(selectedSource === source.id ? null : source.id);
                  setSelectedType(null);
                }}
              >
                <span className="flex items-center gap-2 truncate">
                  <SourceTypeIcon type={source.type} className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{source.name}</span>
                </span>
                {sourceCounts[source.id] > 0 && (
                  <span className="ml-2 text-xs tabular-nums text-muted-foreground">
                    {sourceCounts[source.id]}
                  </span>
                )}
              </button>
            ))}

            <Separator className="my-2" />

            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              onClick={() => setPage("settings")}
            >
              <Settings className="h-3.5 w-3.5" />
              Manage Sources
            </button>
          </div>
        </aside>

        {/* Main content */}
        <div className="min-w-0 flex-1 space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold">
                {selectedSource
                  ? MOCK_SOURCES.find((s) => s.id === selectedSource)?.name ?? "Feed"
                  : selectedType
                    ? { youtube: "YouTube", rss: "RSS Feeds", newsletter: "Newsletters" }[selectedType]
                    : "Feed"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {filtered.length} item{filtered.length !== 1 ? "s" : ""}
                {matchingCount > 0 && ` · ${matchingCount} matching your topics`}
              </p>
            </div>
            <Button size="sm">
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Fetch
            </Button>
          </div>

          {/* Mobile filter pills (hidden on desktop where sidebar shows) */}
          <div className="flex gap-2 md:hidden">
            <Button
              variant={!selectedType ? "secondary" : "outline"}
              size="sm"
              onClick={() => { setSelectedType(null); setSelectedSource(null); }}
            >
              All
            </Button>
            <Button
              variant={selectedType === "youtube" ? "secondary" : "outline"}
              size="sm"
              className="gap-1"
              onClick={() => { setSelectedType("youtube"); setSelectedSource(null); }}
            >
              <Youtube className="h-3.5 w-3.5 text-red-500" />
              YouTube
            </Button>
            <Button
              variant={selectedType === "rss" ? "secondary" : "outline"}
              size="sm"
              className="gap-1"
              onClick={() => { setSelectedType("rss"); setSelectedSource(null); }}
            >
              <Globe className="h-3.5 w-3.5 text-orange-500" />
              RSS
            </Button>
          </div>

          {/* Date-grouped sections */}
          {dateGroups.map((group) => (
            <section key={group.label}>
              <div className="sticky top-0 z-10 -mx-1 mb-3 flex items-center gap-3 bg-background/95 px-1 py-2 backdrop-blur-sm">
                <h2 className="text-sm font-semibold">{group.label}</h2>
                <Separator className="flex-1" />
                <span className="text-xs tabular-nums text-muted-foreground">
                  {group.items.length}
                </span>
              </div>
              <div className="space-y-2">
                {group.items.map((item) => (
                  <Card
                    key={item.id}
                    className={
                      item.matchScore > 0
                        ? "border-l-2 border-l-primary/40"
                        : ""
                    }
                  >
                    <CardContent className="space-y-2 py-3">
                      <div className="flex items-center gap-2">
                        <SourceTypeIcon type={item.sourceType} className="h-3.5 w-3.5" />
                        <span className="text-xs text-muted-foreground">
                          {item.sourceName}
                        </span>
                        <SourceTypeBadge type={item.sourceType} />
                        <span className="ml-auto text-xs text-muted-foreground">
                          {formatRelativeTime(item.publishedDate)}
                        </span>
                      </div>
                      <p className="text-sm font-medium">{item.title}</p>
                      <div className="flex flex-wrap gap-1">
                        {item.topicTags.map((tag) => (
                          <Badge
                            key={tag}
                            variant={FOCUSED_TOPICS.includes(tag) ? "default" : "outline"}
                            className="text-xs"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {item.description}
                      </p>
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDismissed((prev) => new Set(prev).add(item.id))}
                        >
                          <Check className="mr-1 h-3.5 w-3.5" />
                          Done
                        </Button>
                        <Button variant="ghost" size="sm">
                          <BookOpen className="mr-1 h-3.5 w-3.5" />
                          Add to Digest
                        </Button>
                        <a
                          href={item.url}
                          className="ml-auto text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ))}

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Check className="mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">All caught up!</p>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

// ─── Stories ─────────────────────────────────────────────────────────────────

const meta: Meta = {
  title: "Feed/Feed Mockups",
  parameters: {
    layout: "fullscreen",
  },
};
export default meta;

type Story = StoryObj;

export const SettingsPage: Story = {
  name: "1. Settings Page — Sources, Topics, Gmail",
  render: () => <SettingsScreen />,
};

export const FeedEmpty: Story = {
  name: "2. Feed — Empty (no sources, nudge to Settings)",
  render: () => <FeedEmptyScreen />,
};

export const FeedScan: Story = {
  name: "3. Feed — Scan Trigger (fetch progress)",
  render: () => <FeedScanScreen />,
};

export const FeedPopulated: Story = {
  name: "4. Feed — Ranked scrollable feed",
  render: () => <FeedViewScreen />,
};

export const NewsletterStrategy: Story = {
  name: "5. Reference — Newsletter RSS vs Gmail",
  render: () => <NewsletterStrategyScreen />,
};

export const FeedLeftNav: Story = {
  name: "6. Feed — Left Nav + Date Groups",
  render: () => <FeedLeftNavScreen />,
};
