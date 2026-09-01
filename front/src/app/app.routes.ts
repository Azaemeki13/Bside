import { Routes } from '@angular/router';
import { artistGuard } from './guards/artist.guard';
import { adminGuard } from './guards/admin.guard';
import { adminOrModeratorGuard } from './guards/admin-or-moderator.guard';
import { authOrTryMeGuard } from './guards/auth-or-tryme.guard';

/** Keeps every page lazy while preserving the application's public URLs. */
export const routes: Routes = [
    { path: '403', loadComponent: () => import('./errors/forbidden/forbidden').then(m => m.Forbidden) },
    { path: '500', loadComponent: () => import('./errors/server-error/server-error').then(m => m.ServerError) },
    { path: '', loadComponent: () => import('./landing/landing').then(m => m.LandingComponent) },
    { path: 'login', loadComponent: () => import('./login/login').then(m => m.Login) },
    { path: 'signup', loadComponent: () => import('./signup/signup').then(m => m.Signup) },
    { path: 'about-us', loadComponent: () => import('./about-us/about-us').then(m => m.AboutUs) },
    { path: 'terms-of-service', loadComponent: () => import('./legal/terms-of-service/terms-of-service').then(m => m.TermsOfService) },
    { path: 'privacy-policy', loadComponent: () => import('./legal/privacy-policy/privacy-policy').then(m => m.PrivacyPolicy) },
    {
        // Protected pages share one persistent shell so playback survives navigation.
        path: 'bside_app',
        loadComponent: () => import('./core/shell/bside_app').then(m => m.BsideApp),
        children: [
            { path: '', pathMatch: 'full', redirectTo: 'home' },
            { path: 'home', loadComponent: () => import('./features/catalog/home/home').then(m => m.BsideHome) },
            { path: 'library', loadComponent: () => import('./features/library/library').then(m => m.BsideLibrary), canActivate: [authOrTryMeGuard] },
            { path: 'library/liked', loadComponent: () => import('./features/library/library').then(m => m.BsideLibrary), canActivate: [authOrTryMeGuard], data: { libraryView: 'liked' } },
            { path: 'library/daily-mix', loadComponent: () => import('./features/library/library').then(m => m.BsideLibrary), canActivate: [authOrTryMeGuard], data: { libraryView: 'daily-mix' } },
            { path: 'library/playlist/:playlistId', loadComponent: () => import('./features/library/library').then(m => m.BsideLibrary), canActivate: [authOrTryMeGuard], data: { libraryView: 'playlist' } },
            { path: 'album/:albumId', loadComponent: () => import('./features/catalog/album-detail/album-detail').then(m => m.AlbumDetail), canActivate: [authOrTryMeGuard] },
            { path: 'artist/:artistId', loadComponent: () => import('./features/catalog/artist-detail/artist-detail').then(m => m.ArtistDetail), canActivate: [authOrTryMeGuard] },
            { path: 'social', loadComponent: () => import('./features/social/social').then(m => m.BsideSocial), canActivate: [authOrTryMeGuard] },
            { path: 'social/chat/:userId', loadComponent: () => import('./features/social/social').then(m => m.BsideSocial), canActivate: [authOrTryMeGuard] },
            { path: 'upload', loadComponent: () => import('./features/upload/upload').then(m => m.BsideUpload), canActivate: [authOrTryMeGuard, artistGuard] },
            { path: 'admin/artist-requests', loadComponent: () => import('./features/admin/admin-artist-requests/admin-artist-requests').then(m => m.AdminArtistRequests), canActivate: [authOrTryMeGuard, adminGuard] },
            { path: 'admin/users', loadComponent: () => import('./features/admin/admin-users/admin-users').then(m => m.AdminUsers), canActivate: [authOrTryMeGuard, adminOrModeratorGuard] },
            { path: 'settings', loadComponent: () => import('./features/settings/settings').then(m => m.BsideSettings), canActivate: [authOrTryMeGuard] },
            { path: 'settings/profile', loadComponent: () => import('./features/settings/settings').then(m => m.BsideSettings), canActivate: [authOrTryMeGuard], data: { settingsView: 'profile' } },
            { path: 'settings/activity', loadComponent: () => import('./features/settings/settings').then(m => m.BsideSettings), canActivate: [authOrTryMeGuard], data: { settingsView: 'activity' } },
            { path: 'settings/artist', loadComponent: () => import('./features/settings/settings').then(m => m.BsideSettings), canActivate: [authOrTryMeGuard], data: { settingsView: 'artist' } },
        ],
    },
    { path: '**', loadComponent: () => import('./errors/not-found/not-found').then(m => m.NotFound) },
];
