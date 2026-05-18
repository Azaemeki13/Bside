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
            { path: 'favorites', component: BsideFavorites },
            { path: 'social', component: BsideSocial },
            { path: 'settings', component: BsideSettings },
        ],
    },
];
