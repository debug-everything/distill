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
  return apiFetch<CaptureResponse>("/api/capture", {
    method: "POST",
    body: JSON.stringify(data),
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

export interface QueueResponse {
  items: QueueItem[];
  total: number;
}

export function fetchQueue(): Promise<QueueResponse> {
  return apiFetch<QueueResponse>("/api/queue");
}

// Digest
export interface DigestSource {
  article_id: string;
  source_url: string;
  source_name: string | null;
  content_type: string;
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

export interface ProcessingStatus {
  is_processing: boolean;
  total: number;
  current: number;
  stage: string;
}

export function triggerProcess(): Promise<{ ok: boolean; clusters_created?: number; articles_processed?: number }> {
  return apiFetch("/api/digest/process", { method: "POST" });
}

export function fetchProcessingStatus(): Promise<ProcessingStatus> {
  return apiFetch<ProcessingStatus>("/api/digest/status");
}

export function fetchDigest(date?: string): Promise<DigestResponse> {
  const params = date ? `?digest_date=${date}` : "";
  return apiFetch<DigestResponse>(`/api/digest${params}`);
}

export function markClusterDone(clusterId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/digest/${clusterId}/done`, { method: "POST" });
}
