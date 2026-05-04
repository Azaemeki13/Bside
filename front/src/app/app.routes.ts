import { Routes } from '@angular/router';
import { LandingComponent } from './landing/landing'
import { Login } from './login/login';
import { Signup } from './signup/signup';
import { BsideApp } from './bside_app/bside_app';

export const routes: Routes = [
    {path: '', component: LandingComponent },
    {path: 'login', component: Login },
    {path: 'signup', component: Signup },
    {path: 'bside_app', component: BsideApp },
];
