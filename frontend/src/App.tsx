import { useState, useEffect, useCallback } from "react";
import { api } from "./api/client";
import type { Download, VideoInfo } from "./api/types";
import { useProgressWebSocket } from "./hooks/useWebSocket";
import { UrlInput } from "./components/UrlInput";
import { FormatSelector } from "./components/FormatSelector";
import { DownloadList } from "./components/DownloadList";

function App() {
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [currentUrl, setCurrentUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadDownloads = useCallback(async () => {
    const list = await api.listDownloads();
    setDownloads(list);
  }, []);

  useEffect(() => {
    loadDownloads();
  }, [loadDownloads]);

  useProgressWebSocket((msg) => {
    setDownloads((prev) =>
      prev.map((dl) =>
        dl.id === msg.download_id
          ? { ...dl, progress: msg.progress, status: msg.status as Download["status"] }
          : dl
      )
    );
  });

  const handleUrls = async (urls: string[]) => {
    setError("");

    if (urls.length === 1) {
      setLoading(true);
      try {
        const info = await api.extract(urls[0]);
        if (info.is_playlist) {
          setError("재생목록 지원은 추후 추가 예정");
        } else {
          setVideoInfo(info as VideoInfo);
          setCurrentUrl(urls[0]);
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    } else {
      setLoading(true);
      try {
        for (const url of urls) {
          await api.createDownload(url, "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best");
        }
        await loadDownloads();
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleFormatSelect = async (formatId: string) => {
    try {
      await api.createDownload(currentUrl, formatId);
      setVideoInfo(null);
      setCurrentUrl("");
      await loadDownloads();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 px-6 py-4">
        <h1 className="text-xl font-bold">YouTube Downloader</h1>
      </header>
      <main className="mx-auto max-w-4xl p-6 space-y-6">
        <UrlInput onSubmit={handleUrls} loading={loading} />

        {error && (
          <div className="rounded-lg border border-red-800 bg-red-950 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {videoInfo && (
          <FormatSelector
            info={videoInfo}
            onSelect={handleFormatSelect}
            onCancel={() => setVideoInfo(null)}
          />
        )}

        <DownloadList downloads={downloads} />
      </main>
    </div>
  );
}

export default App;
