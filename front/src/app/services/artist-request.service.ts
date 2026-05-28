import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environment';

export interface ArtistRequest {
  id: string;
  user_id: string;
  username: string;
  email: string;
  artist_name: string;
  bio?: string;
  status: string;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
}

export interface ArtistRequestPayload {
  artist_name: string;
  bio?: string;
}

@Injectable({ providedIn: 'root' })
export class ArtistRequestService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  create(payload: ArtistRequestPayload): Observable<ArtistRequest> {
    return this.http.post<ArtistRequest>(`${this.apiUrl}/artist-requests`, payload);
  }

  getPending(): Observable<ArtistRequest[]> {
    return this.http.get<ArtistRequest[]>(`${this.apiUrl}/admin/artist-requests`);
  }

  review(id: string, decision: 'Accepted' | 'Denied'): Observable<ArtistRequest> {
    return this.http.put<ArtistRequest>(`${this.apiUrl}/admin/artist-requests/${id}`, { decision });
  }
}
