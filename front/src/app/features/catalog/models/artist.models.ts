import type { AlbumListItem } from './album.models';

export interface ArtistSongItem {
  id: string;
  album_id: string;
  album_title: string;
  title: string;
  duration_seconds: number;
  audio_url: string;
  status: string;
  created_at: string;
}

export interface ArtistDetailResponse {
  id: string;
  user_id: string | null;
  name: string;
  bio: string | null;
  photo_url: string;
  status: string;
  albums: AlbumListItem[];
  songs: ArtistSongItem[];
}
