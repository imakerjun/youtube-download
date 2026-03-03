export interface VideoFormat {
  format_id: string;
  ext: string;
  resolution: string;
  filesize: number | null;
  acodec: string;
  vcodec: string;
}

export interface VideoInfo {
  is_playlist: boolean;
  video_id: string;
  title: string;
  channel: string;
  duration: number;
  thumbnail_url: string;
  formats: VideoFormat[];
}

export interface PlaylistInfo {
  is_playlist: true;
  playlist_id: string;
  title: string;
  entries: PlaylistEntry[];
}

export interface PlaylistEntry {
  video_id: string;
  title: string;
  channel: string;
  duration: number;
  thumbnail_url: string;
}

export interface Download {
  id: number;
  url: string;
  video_id: string;
  title: string;
  channel: string;
  duration: number;
  thumbnail_url: string;
  format_id: string;
  file_path: string | null;
  file_size: number | null;
  status: "pending" | "downloading" | "completed" | "failed" | "cancelled";
  progress: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface ProgressMessage {
  download_id: number;
  progress: number;
  status: string;
}
