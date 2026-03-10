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
  image_url: string | null;
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
  source_count: number;
  is_merged: boolean;
  status: string;
  sources: DigestSource[];
}

export interface DigestResponse {
  clusters: DigestCluster[];
  date: string;
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
  last_result: ProcessingResult | null;
}

export function triggerProcess(): Promise<{ ok: boolean; detail?: string }> {
  return apiFetch("/api/digests/process", { method: "POST" });
}

export function fetchProcessingStatus(): Promise<ProcessingStatus> {
  return apiFetch<ProcessingStatus>("/api/digests/processing-status");
}

export function fetchDigest(date?: string): Promise<DigestResponse> {
  const params = date ? `?digest_date=${date}` : "";
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
}

export function queryKB(question: string): Promise<QueryResponse> {
  return apiFetch<QueryResponse>("/api/knowledge/query", {
    method: "POST",
    body: JSON.stringify({ question }),
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
}

export interface KBListResponse {
  items: KBItem[];
  total: number;
}

export function fetchKB(): Promise<KBListResponse> {
  return apiFetch<KBListResponse>("/api/knowledge");
}
