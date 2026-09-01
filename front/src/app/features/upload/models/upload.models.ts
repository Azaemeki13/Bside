/** Audio formats accepted by the media backend. */
export type UploadAudioFormat = 'wav' | 'flac';

/** Album data returned after creating an upload container. */
export interface UploadAlbum {
  id: string;
  artist_id: string;
  title: string;
  genre: string;
  cover_url: string;
  status: string;
}

/** Song data and its temporary storage URL returned by the API. */
export interface UploadSongResponse {
  song: {
    id: string;
    album_id: string;
    title: string;
    duration_seconds: number;
    audio_url: string;
    status: string;
    created_at: string;
  };
  upload_url: string;
}

/** Artist details used by the administration upload form. */
export interface UploadArtist {
  id: string;
  name: string;
  bio: string | null;
  photo_url: string;
  status: string;
}

/** Progress for one file or a complete multi-track upload. */
export interface MediaUploadProgress {
  loaded: number;
  total: number;
  percent: number;
}
