import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environment';
import type { SearchEntityType, SearchOptions, SearchResponse, SearchResult, SearchSort } from '../features/catalog/models/search.models';

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
