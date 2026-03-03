import type { Download, VideoInfo, PlaylistInfo } from "./types";

const BASE = "/api";

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  return res.json();
}

export const api = {
  extract: (url: string) =>
    fetchJSON<VideoInfo | PlaylistInfo>("/extract", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),

  createDownload: (url: string, format_id: string) =>
    fetchJSON<Download>("/downloads", {
      method: "POST",
      body: JSON.stringify({ url, format_id }),
    }),

  listDownloads: () => fetchJSON<Download[]>("/downloads"),

  getDownload: (id: number) => fetchJSON<Download>(`/downloads/${id}`),

  cancelDownload: (id: number) =>
    fetchJSON<{ status: string }>(`/downloads/${id}`, { method: "DELETE" }),
};
