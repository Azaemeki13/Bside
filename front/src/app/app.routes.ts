import { Routes } from '@angular/router';
import { LandingComponent } from './landing/landing'
import { Login } from './login/login';
import { Signup } from './signup/signup';
import { BsideApp } from './bside_app/bside_app';
import { BsideHome } from './bside_app/home/home';
import { BsideLibrary } from './bside_app/library/library';
import { BsideFavorites } from './bside_app/favorites/favorites';
import { BsideSocial } from './bside_app/social/social';
import { BsideSettings } from './bside_app/settings/settings';
import { BsideUpload } from './bside_app/upload/upload';
import { BsideAlbums } from './bside_app/albums/albums';
import { AlbumDetail } from './bside_app/album-detail/album-detail';
import { artistGuard } from './guards/artist.guard';
import { adminGuard } from './guards/admin.guard';
import { AdminArtistRequests } from './bside_app/admin-artist-requests/admin-artist-requests';

export const routes: Routes = [
    {path: '', component: LandingComponent },
    {path: 'login', component: Login },
    {path: 'signup', component: Signup },
    {
        path: 'bside_app',
        component: BsideApp,
        children: [
            { path: '', pathMatch: 'full', redirectTo: 'home' },
            { path: 'home', component: BsideHome },
            { path: 'library', component: BsideLibrary },
            { path: 'albums', component: BsideAlbums },
            { path: 'album/:albumId', component: AlbumDetail },
            { path: 'favorites', component: BsideFavorites },
            { path: 'social', component: BsideSocial },
            { path: 'upload', component: BsideUpload, canActivate: [artistGuard] },
            { path: 'admin/artist-requests', component: AdminArtistRequests, canActivate: [adminGuard] },
            { path: 'settings', component: BsideSettings },
        ],
    },
];
