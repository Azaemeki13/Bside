import { Observable } from 'rxjs';

export type AudioFormat = 'flac' | 'wav';

export type RepeatMode = 'off' | 'all' | 'one';

/** A resolved track that Howl can play directly. */
export type AudioTrack = {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  src: string;
  format: AudioFormat;
  coverUrl?: string;
};

/** An item in the play queue; the caller supplies the URL fetcher to keep the player generic. */
export type QueueEntry = {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  format: AudioFormat;
  coverUrl?: string;
  onRequestUrl: () => Observable<{ url: string }>;
};
