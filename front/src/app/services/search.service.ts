import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environment';

export type SearchResult =
  | {
      type: 'song';
      data: {
        id: string;
        title: string;
        artist: string;
        audio_url: string;
        album_id: string;
      };
    }
  | {
      type: 'album';
      data: {
        id: string;
        name: string;
        artist: string;
      };
    }
  | {
      type: 'artist';
      data: {
        id: string;
        name: string;
      };
    }
  | {
      type: 'playlist';
      data: {
        id: string;
        name: string;
        creator: string;
      };
    };

@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  search(query: string): Observable<SearchResult[]> {
    const params = new HttpParams().set('q', query);
    return this.http.get<SearchResult[]>(`${this.apiUrl}/search`, { params });
  }
}
