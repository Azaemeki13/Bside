import { Routes } from '@angular/router';
import { LandingComponent } from './landing/landing'
import { Login } from './login/login';
import { Signup } from './signup/signup';
import { BsideApp } from './bside_app/bside_app';
import { BsideHome } from './bside_app/home/home';
import { BsideLibrary } from './bside_app/library/library';
import { BsideSocial } from './bside_app/social/social';
import { BsideSettings } from './bside_app/settings/settings';
import { BsideUpload } from './bside_app/upload/upload';
import { AlbumDetail } from './bside_app/album-detail/album-detail';
import { ArtistDetail } from './bside_app/artist-detail/artist-detail';
import { artistGuard } from './guards/artist.guard';
import { adminGuard } from './guards/admin.guard';
import { AdminArtistRequests } from './bside_app/admin-artist-requests/admin-artist-requests';
import { AdminUsers } from './bside_app/admin-users/admin-users';
import { Forbidden } from './errors/forbidden/forbidden';
import { ServerError } from './errors/server-error/server-error';
import { NotFound } from './errors/not-found/not-found';

export const routes: Routes = [
    { path: '403', component: Forbidden },
    { path: '500', component: ServerError },
    { path: '', component: LandingComponent },
    { path: 'login', component: Login },
    { path: 'signup', component: Signup },
    {
        path: 'bside_app',
        component: BsideApp,
        children: [
            { path: '', pathMatch: 'full', redirectTo: 'home' },
            { path: 'home', component: BsideHome },
            { path: 'library', component: BsideLibrary },
            { path: 'album/:albumId', component: AlbumDetail },
            { path: 'artist/:artistId', component: ArtistDetail },
            { path: 'social', component: BsideSocial },
            { path: 'upload', component: BsideUpload, canActivate: [artistGuard] },
            { path: 'admin/artist-requests', component: AdminArtistRequests, canActivate: [adminGuard] },
            { path: 'admin/users', component: AdminUsers, canActivate: [adminGuard] },
            { path: 'settings', component: BsideSettings },
        ],
    },
    { path: '**', component: NotFound },
];