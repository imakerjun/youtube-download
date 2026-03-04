import { useState, useEffect, useCallback } from "react";
import { api } from "./api/client";
import type { Download, VideoInfo, PlaylistInfo, PlaylistEntry } from "./api/types";
import { useProgressWebSocket } from "./hooks/useWebSocket";
import { UrlInput } from "./components/UrlInput";
import { FormatSelector } from "./components/FormatSelector";
import { DownloadList } from "./components/DownloadList";
import { VideoSkeleton } from "./components/Skeleton";
import { ToastContainer, toast } from "./components/Toast";
import { friendlyError } from "./utils/errorMessages";
import { PlaylistSelector } from "./components/PlaylistSelector";

function App() {
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [currentUrl, setCurrentUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [playlistInfo, setPlaylistInfo] = useState<PlaylistInfo | null>(null);

  const loadDownloads = useCallback(async () => {
    const list = await api.listDownloads();
    setDownloads(list);
  }, []);

  useEffect(() => {
    loadDownloads();
  }, [loadDownloads]);

  useProgressWebSocket((msg) => {
    setDownloads((prev) =>
      prev.map((dl) => {
        if (dl.id !== msg.download_id) return dl;
        const updated = {
          ...dl,
          progress: msg.progress,
          status: msg.status as Download["status"],
          speed: msg.speed ?? 0,
          eta: msg.eta ?? 0,
        };
        // Toast on completion or failure
        if (msg.status === "completed" && dl.status !== "completed") {
          toast(`"${dl.title}" 다운로드 완료`, "success");
        }
        if (msg.status === "failed" && dl.status !== "failed") {
          toast(`"${dl.title}" 다운로드 실패`, "error");
        }
        return updated;
      })
    );
  });

  const handleUrls = async (urls: string[]) => {
    setError("");

    if (urls.length === 1) {
      setLoading(true);
      try {
        const info = await api.extract(urls[0]);
        if (info.is_playlist) {
          setPlaylistInfo(info as PlaylistInfo);
        } else {
          setVideoInfo(info as VideoInfo);
          setCurrentUrl(urls[0]);
        }
      } catch (e: any) {
        setError(friendlyError(e.message));
      } finally {
        setLoading(false);
      }
    } else {
      setLoading(true);
      try {
        for (const url of urls) {
          await api.createDownload(url, "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best");
        }
        toast(`${urls.length}개 다운로드가 시작되었습니다`, "info");
        await loadDownloads();
      } catch (e: any) {
        setError(friendlyError(e.message));
      } finally {
        setLoading(false);
      }
    }
  };

  const handlePlaylistDownload = async (entries: PlaylistEntry[], formatId: string) => {
    try {
      const urls = entries.map(
        (e) => `https://www.youtube.com/watch?v=${e.video_id}`
      );
      await api.batchDownload(urls, formatId);
      setPlaylistInfo(null);
      toast(`${entries.length}개 다운로드가 시작되었습니다`, "info");
      await loadDownloads();
    } catch (e: any) {
      setError(friendlyError(e.message));
    }
  };

  const handleFormatSelect = async (formatId: string) => {
    try {
      await api.createDownload(currentUrl, formatId);
      setVideoInfo(null);
      setCurrentUrl("");
      toast("다운로드가 시작되었습니다", "info");
      await loadDownloads();
    } catch (e: any) {
      setError(friendlyError(e.message));
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 px-6 py-4">
        <h1 className="text-xl font-bold">YouTube Downloader</h1>
      </header>
      <main className="mx-auto max-w-3xl p-6 space-y-6">
        <UrlInput onSubmit={handleUrls} loading={loading} />

        {error && (
          <div className="rounded-lg border border-red-800/50 bg-red-950/50 px-4 py-3
                          text-sm text-red-300 animate-fade-in-up">
            {error}
          </div>
        )}

        {loading && !videoInfo && <VideoSkeleton />}

        {videoInfo && (
          <FormatSelector
            info={videoInfo}
            onSelect={handleFormatSelect}
            onCancel={() => setVideoInfo(null)}
          />
        )}

        {playlistInfo && (
          <PlaylistSelector
            info={playlistInfo}
            onDownload={handlePlaylistDownload}
            onCancel={() => setPlaylistInfo(null)}
          />
        )}

        <DownloadList downloads={downloads} onUpdate={loadDownloads} />
      </main>
      <ToastContainer />
    </div>
  );
}

export default App;
