import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: 'bside_app/album/:albumId',
    renderMode: RenderMode.Server
  },
  {
    path: 'bside_app/artist/:artistId',
    renderMode: RenderMode.Server
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
