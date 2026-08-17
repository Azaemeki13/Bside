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

export type SearchEntityType = 'all' | 'song' | 'album' | 'artist' | 'playlist';
export type SearchSort = 'relevance' | 'name_asc' | 'name_desc';

export interface SearchOptions {
  entityType?: SearchEntityType;
  sort?: SearchSort;
  page?: number;
  pageSize?: number;
}

export interface SearchResponse {
  results: SearchResult[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  search(query: string, options: SearchOptions = {}): Observable<SearchResponse> {
    const params = new HttpParams()
      .set('q', query)
      .set('entity_type', options.entityType ?? 'all')
      .set('sort', options.sort ?? 'relevance')
      .set('page', options.page ?? 1)
      .set('page_size', options.pageSize ?? 10);
    return this.http.get<SearchResponse>(`${this.apiUrl}/search`, { params });
  }
}
