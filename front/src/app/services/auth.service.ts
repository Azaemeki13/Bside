import { Injectable, PLATFORM_ID, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, switchMap } from 'rxjs';
import { environment } from '../../environment';
import { LoginPayload, AuthResponse, RegisterPayload } from '../models/auth.model';
import { isPlatformBrowser } from '@angular/common';

export interface UserProfile {
    id: string;
    username: string;
    email: string;
    role: string;
    avatar_url?: string;
}

@Injectable({
    providedIn: 'root'
})
export class AuthService { 
    private apiUrl = environment.apiUrl;
    private readonly platformId = inject(PLATFORM_ID);
    private readonly http = inject(HttpClient);
    currentUser = signal<UserProfile| null>(null);
    login(payload: LoginPayload): Observable<AuthResponse> {
        return this.http.post<AuthResponse>(`${this.apiUrl}/login`, payload).pipe(
            tap(response => {
                localStorage.setItem('auth_token', response.token);
                console.log("Login Successful, token saved on the cookies.");
            })
        );
    }
    logout() {
        localStorage.removeItem('auth_token');
    }
    loadUserProfile() {
        if (this.currentUser() !== null ) return;
        if (isPlatformBrowser(this.platformId)) {
            this.http.get<UserProfile>(`${this.apiUrl}/users/me`).subscribe({
                next: (user) => {
                    this.currentUser.set(user);
                    console.log("Profile loaded:", user.username);
                },
                error: (err) => {
                    console.error("Failed to load profile:", err);
                }
            });
        }
    }
    registerAndLogin(payload: RegisterPayload): Observable<AuthResponse> {
        return this.http.post(`${this.apiUrl}/register`, payload).pipe(
            switchMap(() => {
                const loginData: LoginPayload = {
                    identifier: payload.username,
                    password: payload.password
                };
                return this.login(loginData);
            })
        );
    }
}