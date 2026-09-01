export interface TopSongStat {
  song_id: string;
  title: string;
  play_count: number;
}

export interface DailyActivityStat {
  day: string;
  play_count: number;
  listened_seconds: number;
}

export interface UserActivityAnalytics {
  total_plays: number;
  total_listened_seconds: number;
  total_likes: number;
  unique_songs_played: number;
  top_songs: TopSongStat[];
  daily_activity: DailyActivityStat[];
}

export interface RecentPlayItem {
  song_id: string;
  title: string;
  audio_url: string;
  artist_id: string;
  artist_name: string;
  album_id: string;
  cover_url: string;
  last_played_at: string;
}

export interface TopSpinItem {
  artist_id: string;
  artist_name: string;
  photo_url: string;
  listened_seconds: number;
}
