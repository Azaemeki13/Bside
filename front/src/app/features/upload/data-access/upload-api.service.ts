import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environment';
import type { UploadAlbum, UploadArtist, UploadAudioFormat, UploadSongResponse } from '../models/upload.models';

export interface CreateAlbumInput {
  title: string;
  genre: string;
  cover?: File | null;
}

export interface CreateArtistInput {
  name: string;
  bio?: string;
  photo?: File | null;
}

export interface CreateUploadSongInput {
  title: string;
  albumId: string;
  durationSeconds: number;
  format: UploadAudioFormat;
}

/** Owns the HTTP contract used by artist and administrator upload flows. */
@Injectable({ providedIn: 'root' })
export class UploadApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  /** Creates an album for the currently authenticated artist. */
  createAlbum(input: CreateAlbumInput): Observable<UploadAlbum> {
    return this.http.post<UploadAlbum>(`${this.apiUrl}/albums`, this.albumForm(input));
  }

  /** Creates an album under an artist selected by an administrator. */
  createAdminAlbum(artistId: string, input: CreateAlbumInput): Observable<UploadAlbum> {
    return this.http.post<UploadAlbum>(
      `${this.apiUrl}/admin/artists/${artistId}/albums`,
      this.albumForm(input),
    );
  }

  /** Lists artists available in the administrator upload form. */
  getArtists(): Observable<UploadArtist[]> {
    return this.http.get<UploadArtist[]>(`${this.apiUrl}/artists`);
  }

  /** Creates an artist before an administrator uploads their release. */
  createArtist(input: CreateArtistInput): Observable<UploadArtist> {
    const form = new FormData();
    form.append('name', input.name);
    if (input.bio) form.append('bio', input.bio);
    if (input.photo) form.append('photo', input.photo);
    return this.http.post<UploadArtist>(`${this.apiUrl}/artists`, form);
  }

  /** Reserves a song record and receives its presigned storage URL. */
  createSong(input: CreateUploadSongInput): Observable<UploadSongResponse> {
    return this.http.post<UploadSongResponse>(`${this.apiUrl}/songs`, {
      title: input.title,
      album_id: input.albumId,
      duration_seconds: input.durationSeconds,
      format: input.format,
    });
  }

  /** Tells the backend that the storage upload finished successfully. */
  verifySong(songId: string): Observable<void> {
    return this.http.put<void>(`${this.apiUrl}/songs/${songId}/verify`, {});
  }

  /** Builds the multipart body shared by both album endpoints. */
  private albumForm(input: CreateAlbumInput): FormData {
    const form = new FormData();
    form.append('title', input.title);
    form.append('genre', input.genre);
    if (input.cover) form.append('cover', input.cover);
    return form;
  }
}
