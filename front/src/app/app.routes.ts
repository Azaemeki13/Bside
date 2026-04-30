import { Routes } from '@angular/router';
import { LandingComponent } from './landing/landing'
import { Login } from './login/login';
import { Signup } from './signup/signup';

export const routes: Routes = [
    {path: '', component: LandingComponent },
    {path: 'login', component: Login },
    {path: 'signup', component: Signup },
];
