import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environment';
import { UserProfile } from '../models/auth.model';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  getUsers(): Observable<UserProfile[]> {
    return this.http.get<UserProfile[]>(`${this.apiUrl}/users`);
  }

  banUser(userId: string): Observable<UserProfile> {
    return this.http.put<UserProfile>(`${this.apiUrl}/admin/users/${userId}/ban`, {});
  }

  unbanUser(userId: string): Observable<UserProfile> {
    return this.http.put<UserProfile>(`${this.apiUrl}/admin/users/${userId}/unban`, {});
  }
}
