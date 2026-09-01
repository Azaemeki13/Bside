export type SearchResult =
  | { type: 'song'; data: { id: string; title: string; artist: string; audio_url: string; album_id: string } }
  | { type: 'album'; data: { id: string; name: string; artist: string } }
  | { type: 'artist'; data: { id: string; name: string } }
  | { type: 'playlist'; data: { id: string; name: string; creator: string } };

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
