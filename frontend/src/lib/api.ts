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
