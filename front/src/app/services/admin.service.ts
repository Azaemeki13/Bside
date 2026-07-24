import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environment';
import { UserProfile } from '../models/auth.model';

export interface AdminUpdateUserPayload {
  display_name?: string;
  role?: 'Admin' | 'Moderator' | 'User';
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  getUsers(): Observable<UserProfile[]> {
    return this.http.get<UserProfile[]>(`${this.apiUrl}/admin/users`);
  }

  banUser(userId: string): Observable<UserProfile> {
    return this.http.put<UserProfile>(`${this.apiUrl}/admin/users/${userId}/ban`, {});
  }

  unbanUser(userId: string): Observable<UserProfile> {
    return this.http.put<UserProfile>(`${this.apiUrl}/admin/users/${userId}/unban`, {});
  }

  updateUser(userId: string, payload: AdminUpdateUserPayload): Observable<UserProfile> {
    return this.http.patch<UserProfile>(`${this.apiUrl}/admin/users/${userId}`, payload);
  }

  deleteUser(userId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/admin/users/${userId}`);
  }
}
