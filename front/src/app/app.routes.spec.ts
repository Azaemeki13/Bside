import { RenderMode } from '@angular/ssr';
import { describe, expect, it } from 'vitest';
import { routes } from './app.routes';
import { serverRoutes } from './app.routes.server';

/** Finds the application shell without depending on its position in the route list. */
function findShellRoute() {
  return routes.find((route) => route.path === 'bside_app');
}

describe('application route contracts', () => {
  it('keeps every protected child under the persistent application shell', () => {
    const childPaths = findShellRoute()?.children?.map((route) => route.path);

    // These paths are public contracts used by links, bookmarks, and redirects.
    expect(childPaths).toEqual([
      '',
      'home',
      'library',
      'library/liked',
      'library/daily-mix',
      'library/playlist/:playlistId',
      'album/:albumId',
      'artist/:artistId',
      'social',
      'social/chat/:userId',
      'upload',
      'admin/artist-requests',
      'admin/users',
      'settings',
      'settings/profile',
      'settings/activity',
      'settings/artist',
    ]);
  });

  it('keeps the not-found route last so it cannot hide valid pages', () => {
    expect(routes.at(-1)?.path).toBe('**');
  });

  it('preserves browser-only rendering for stateful social and library pages', () => {
    const clientPaths = serverRoutes
      .filter((route) => route.renderMode === RenderMode.Client)
      .map((route) => route.path);

    expect(clientPaths).toEqual([
      'bside_app/library',
      'bside_app/library/liked',
      'bside_app/library/daily-mix',
      'bside_app/library/playlist/:playlistId',
      'bside_app/social',
      'bside_app/social/chat/:userId',
    ]);
  });

  it('continues server-rendering public album and artist detail pages', () => {
    const serverPaths = serverRoutes
      .filter((route) => route.renderMode === RenderMode.Server)
      .map((route) => route.path);

    expect(serverPaths).toEqual([
      'bside_app/album/:albumId',
      'bside_app/artist/:artistId',
    ]);
  });
});
