import { Injectable, signal } from '@angular/core';

export interface Playlist {
  name: string;
  description: string;
  cover: string | null;
  isLiked?: boolean;
}

@Injectable({ providedIn: 'root' })
export class PlaylistService {
  readonly likedPlaylist: Playlist = {
    name: 'Liked Songs',
    description: 'Your liked songs',
    cover: null,
    isLiked: true,
  };

  playlists = signal<Playlist[]>([]);
  selectedPlaylist = signal<Playlist | null>(null);

  add(playlist: Playlist): void {
    this.playlists.update(list => [...list, playlist]);
  }

  select(playlist: Playlist): void {
    this.selectedPlaylist.set(playlist);
  }
}