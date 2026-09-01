export interface AlbumListItem {
  id: string;
  artist_id: string;
  artist_name: string;
  title: string;
  genre: string;
  cover_url: string;
  status: string;
  song_count: number;
  created_at: string;
}

export interface AlbumSongItem {
  id: string;
  title: string;
  duration_seconds: number;
  status: string;
  audio_url: string;
  created_at: string;
}

export interface AlbumDetailedResponse extends AlbumListItem {
  songs: AlbumSongItem[];
}

export interface NewReleaseSong {
  song_id: string;
  title: string;
  audio_url: string;
  album_id: string;
  album_title: string;
  cover_url: string;
  artist_id: string;
  artist_name: string;
}
