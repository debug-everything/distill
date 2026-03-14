const API_BASE = "";

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API error: ${res.status} ${text}`);
  }
  return res.json();
}

// Health
export interface HealthResponse {
  status: string;
  db: string;
  ollama: string;
  env: string;
}

export function fetchHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>("/health");
}

// Capture
export interface CaptureRequest {
  url: string;
  mode: "consume_later" | "learn_now";
}

export interface CaptureResponse {
  ok: boolean;
  article_id: string | null;
  duplicate: boolean;
  title: string | null;
  extraction_quality: string | null;
}

export function captureUrl(data: CaptureRequest): Promise<CaptureResponse> {
  return apiFetch<CaptureResponse>("/api/articles", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// Batch capture
export interface BatchCaptureItemResult {
  url: string;
  ok: boolean;
  article_id: string | null;
  duplicate: boolean;
  title: string | null;
  extraction_quality: string | null;
  error: string | null;
}

export interface BatchCaptureResponse {
  ok: boolean;
  results: BatchCaptureItemResult[];
  added: number;
  duplicates: number;
  failed: number;
}

export function captureBatch(urls: string[], mode: "consume_later" | "learn_now"): Promise<BatchCaptureResponse> {
  return apiFetch<BatchCaptureResponse>("/api/articles/batch", {
    method: "POST",
    body: JSON.stringify({ urls, mode }),
  });
}

// Queue
export interface QueueItem {
  id: string;
  url: string;
  title: string | null;
  source_domain: string | null;
  mode: string;
  status: string;
  content_type: string;
  extraction_quality: string;
  created_at: string;
}

export interface QueueSection {
  items: QueueItem[];
  total: number;
}

export interface QueueResponse {
  consume_later: QueueSection;
  learn_now: QueueSection;
}

export function fetchQueue(): Promise<QueueResponse> {
  return apiFetch<QueueResponse>("/api/articles");
}

export function deleteArticle(articleId: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/articles/${articleId}`, {
    method: "DELETE",
  });
}

// Learn Now status
export interface LearnNowResult {
  ok: boolean;
  indexed?: number;
  failed?: number;
  detail?: string;
}

export interface LearnNowStatus {
  is_processing: boolean;
  total: number;
  current: number;
  stage: string;
  llm_mode: "local" | "cloud" | null;
  last_result: LearnNowResult | null;
}

export function fetchLearnNowStatus(): Promise<LearnNowStatus> {
  return apiFetch<LearnNowStatus>("/api/articles/indexing-status");
}

// Digest
export interface DigestSource {
  article_id: string;
  source_url: string;
  source_name: string | null;
  content_type: string;
  extraction_quality: string;
  image_url: string | null;
}

export interface UnpackSection {
  title: string;
  content: string;
  timestamp?: string | null;
}

export interface UnpackResponse {
  ok: boolean;
  sections: UnpackSection[];
}

export interface DigestCluster {
  id: string;
  digest_date: string;
  title: string;
  headline: string;
  summary: string;
  bullets: string[];
  quotes: string[];
  topic_tags: string[];
  content_style: string | null;
  information_density: number | null;
  content_attributes: Record<string, unknown> | null;
  unpacked_sections: UnpackSection[] | null;
  source_count: number;
  is_merged: boolean;
  status: string;
  sources: DigestSource[];
}

export interface DigestResponse {
  clusters: DigestCluster[];
  has_more: boolean;
}

export interface ProcessingResult {
  ok: boolean;
  clusters_created?: number;
  articles_processed?: number;
  detail?: string;
}

export interface ProcessingStatus {
  is_processing: boolean;
  total: number;
  current: number;
  stage: string;
  llm_mode: "local" | "cloud" | null;
  last_result: ProcessingResult | null;
}

export function triggerProcess(): Promise<{ ok: boolean; detail?: string }> {
  return apiFetch("/api/digests/process", { method: "POST" });
}

export function fetchProcessingStatus(): Promise<ProcessingStatus> {
  return apiFetch<ProcessingStatus>("/api/digests/processing-status");
}

export function fetchDigest(beforeDate?: string): Promise<DigestResponse> {
  const params = beforeDate ? `?before_date=${beforeDate}` : "";
  return apiFetch<DigestResponse>(`/api/digests${params}`);
}

export function markClusterDone(clusterId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/digests/${clusterId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "done" }),
  });
}

export function promoteCluster(clusterId: string): Promise<{ ok: boolean; indexed?: number; failed?: number }> {
  return apiFetch(`/api/digests/${clusterId}/promote`, { method: "POST" });
}

export function unpackCluster(clusterId: string): Promise<UnpackResponse> {
  return apiFetch<UnpackResponse>(`/api/digests/${clusterId}/unpack`, { method: "POST" });
}

// LLM Status
export interface LLMStatus {
  llm_mode: "local" | "cloud" | null;
  is_active: boolean;
}

export function fetchLLMStatus(): Promise<LLMStatus> {
  return apiFetch<LLMStatus>("/api/llm-status");
}

// RAG / Knowledge Base
export interface SourceChunk {
  knowledge_item_id: string;
  chunk_index: number;
  chunk_text: string;
  title: string;
  url: string | null;
  similarity: number;
}

export interface QueryResponse {
  ok: boolean;
  answer: string;
  sources: SourceChunk[];
  related_questions: string[];
  llm_mode: "local" | "cloud" | null;
}

export interface ChatHistoryEntry {
  question: string;
  answer: string;
}

export function queryKB(
  question: string,
  history?: ChatHistoryEntry[],
): Promise<QueryResponse> {
  return apiFetch<QueryResponse>("/api/knowledge/query", {
    method: "POST",
    body: JSON.stringify({ question, history: history ?? [] }),
  });
}

export interface KBItem {
  id: string;
  title: string;
  url: string | null;
  source_type: string;
  topic_tags: string[];
  created_at: string;
  chunk_count: number;
  content_type: string;
  extraction_quality: string;
}

export interface KBListResponse {
  items: KBItem[];
  total: number;
  topics: string[];
}

export function fetchKB(offset = 0, limit = 10): Promise<KBListResponse> {
  return apiFetch<KBListResponse>(`/api/knowledge?offset=${offset}&limit=${limit}`);
}

export function deleteKBItem(itemId: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/knowledge/${itemId}`, {
    method: "DELETE",
  });
}

// Focused Topics (Settings)
export interface FocusedTopicsResponse {
  topics: string[];
}

export function fetchFocusedTopics(): Promise<FocusedTopicsResponse> {
  return apiFetch<FocusedTopicsResponse>("/api/settings/focused-topics");
}

export function updateFocusedTopics(topics: string[]): Promise<FocusedTopicsResponse> {
  return apiFetch<FocusedTopicsResponse>("/api/settings/focused-topics", {
    method: "PUT",
    body: JSON.stringify({ topics }),
  });
}

// Stats
export interface StatsTotals {
  total_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  local_calls: number;
  cloud_calls: number;
}

export interface StatsTaskBreakdown {
  task_type: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

export interface StatsDailyEntry {
  date: string;
  calls: number;
  cost_usd: number;
  local_calls: number;
  cloud_calls: number;
}

export interface StatsRecentCall {
  task_type: string;
  model: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  created_at: string;
}

export interface StatsResponse {
  totals: StatsTotals;
  by_task: StatsTaskBreakdown[];
  daily: StatsDailyEntry[];
  recent: StatsRecentCall[];
}

export function fetchStats(): Promise<StatsResponse> {
  return apiFetch<StatsResponse>("/api/stats");
}
