import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environment';
import type { ArtistDetailResponse, ArtistSongItem } from '../features/catalog/models/artist.models';

@Injectable({ providedIn: 'root' })
export class ArtistService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  getArtist(id: string): Observable<ArtistDetailResponse> {
    return this.http.get<ArtistDetailResponse>(`${this.apiUrl}/artists/${id}`);
  }
}
