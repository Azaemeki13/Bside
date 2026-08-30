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
    path: 'bside_app/library',
    renderMode: RenderMode.Client
  },
  {
    path: 'bside_app/library/liked',
    renderMode: RenderMode.Client
  },
  {
    path: 'bside_app/library/daily-mix',
    renderMode: RenderMode.Client
  },
  {
    path: 'bside_app/library/playlist/:playlistId',
    renderMode: RenderMode.Client
  },
  {
    path: 'bside_app/social',
    renderMode: RenderMode.Client
  },
  {
    path: 'bside_app/social/chat/:userId',
    renderMode: RenderMode.Client
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
