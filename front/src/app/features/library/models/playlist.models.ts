export interface Playlist {
  id: string;
  title: string;
  description?: string;
  owner_id: string;
  owner_username?: string;
  total_duration?: number;
  song_count?: number;
  is_public: boolean;
  created_at?: string;
  cover_url?: string;
}

export interface PlaylistSongItem {
  link_id: string;
  song_id: string;
  title: string;
  duration_seconds: number;
  position: number;
  audio_url: string;
  status: string;
  artist_id: string;
  artist_name: string;
  cover_url: string;
}

export interface PlaylistDetailedResponse extends Playlist {
  songs: PlaylistSongItem[];
}

export interface AddSongResponse {
  message: string;
  warning?: string | null;
}
