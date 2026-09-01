import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environment';
import type { AddSongResponse, Playlist, PlaylistDetailedResponse } from '../models/playlist.models';

/** Owns every HTTP request used by the playlist and liked-songs features. */
@Injectable({ providedIn: 'root' })
export class PlaylistApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  /** Loads all playlists for the current user. */
  getPlaylists(): Observable<Playlist[]> {
    return this.http.get<Playlist[]>(`${this.apiUrl}/playlists`);
  }

  /** Loads a single playlist with its full song list. */
  getById(id: string): Observable<PlaylistDetailedResponse> {
    return this.http.get<PlaylistDetailedResponse>(`${this.apiUrl}/playlists/${id}`);
  }

  /** Creates a new playlist, optionally with a cover image. */
  create(title: string, description: string, cover?: File): Observable<Playlist> {
    const form = new FormData();
    form.append('title', title);
    if (description.trim()) form.append('description', description);
    if (cover) form.append('cover', cover);
    return this.http.post<Playlist>(`${this.apiUrl}/playlists`, form);
  }

  /** Permanently deletes a playlist. */
  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/playlists/${id}`);
  }

  /** Adds a song to a playlist by its link id. */
  addSong(playlistId: string, songId: string): Observable<AddSongResponse> {
    return this.http.post<AddSongResponse>(
      `${this.apiUrl}/playlists/${playlistId}/songs/${songId}`, {},
    );
  }

  /** Removes a song from a playlist by its link id. */
  removeSong(playlistId: string, linkId: string): Observable<void> {
    return this.http.delete<void>(
      `${this.apiUrl}/playlists/${playlistId}/songs/${linkId}`,
    );
  }

  /** Loads the current user's liked-songs playlist with its full song list. */
  getLikedSongs(): Observable<PlaylistDetailedResponse> {
    return this.http.get<PlaylistDetailedResponse>(`${this.apiUrl}/liked-songs`);
  }

  /** Adds a song to the liked-songs playlist. */
  likeSong(songId: string): Observable<AddSongResponse> {
    return this.http.post<AddSongResponse>(`${this.apiUrl}/songs/${songId}/like`, {});
  }

  /** Removes a song from the liked-songs playlist. */
  unlikeSong(songId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/songs/${songId}/like`);
  }
}
