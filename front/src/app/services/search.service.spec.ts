import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SearchService } from './search.service';

describe('SearchService', () => {
  let service: SearchService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SearchService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('searches with default options when none are provided', () => {
    service.search('hello').subscribe();
    const req = http.expectOne((r) => r.url === '/api/search');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('q')).toBe('hello');
    expect(req.request.params.get('entity_type')).toBe('all');
    expect(req.request.params.get('sort')).toBe('relevance');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('page_size')).toBe('10');
    req.flush({ results: [], page: 1, page_size: 10, total: 0, total_pages: 0 });
  });

  it('searches with custom options', () => {
    service.search('jazz', { entityType: 'album', sort: 'name_asc', page: 2, pageSize: 5 }).subscribe();
    const req = http.expectOne((r) => r.url === '/api/search');
    expect(req.request.params.get('entity_type')).toBe('album');
    expect(req.request.params.get('sort')).toBe('name_asc');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('page_size')).toBe('5');
    req.flush({ results: [], page: 2, page_size: 5, total: 0, total_pages: 0 });
  });
});
