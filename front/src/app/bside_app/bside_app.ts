import { Component, OnInit, inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { RouterOutlet } from '@angular/router';
import { NavBar } from '../components/nav-bar/nav-bar';
import { SideBar } from '../components/side-bar/side-bar';
import { SoundBar } from './sound-bar/sound-bar';
import { AuthService } from '../services/auth.service';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-bside-app',
  templateUrl: './bside_app.html',
  styleUrl: './bside_app.scss',
  imports: [CommonModule, RouterOutlet, NavBar, SideBar, SoundBar, RouterLink],
})
export class BsideApp implements OnInit {
  name = '';
  private readonly platformId = inject(PLATFORM_ID);
  private readonly route = inject(ActivatedRoute);
  private readonly cdr = inject(ChangeDetectorRef);
  protected readonly authService = inject(AuthService);

  async ngOnInit(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    let token = localStorage.getItem('auth_token');
    console.log('Token from localStorage:', token);
    if (!token) {
      token = this.route.snapshot.queryParamMap.get('token') ?? null;
      console.log('Token from query params:', token);
      if (token) {
        localStorage.setItem('auth_token', token);
        history.replaceState(null, '', window.location.pathname);
      }
    }
    if (!token) {
      console.log('No token found');
      return;
    }
    try {
      console.log('Fetching user profile...');
      const res = await fetch('http://localhost:8080/users/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Response status:', res.status);
      if (!res.ok) {
        console.log('Response not ok');
        return;
      }
      const data = await res.json();
      console.log('User data:', data);
      this.authService.currentUser.set(data);
      this.cdr.markForCheck();
      this.name = data.username ?? data.email ?? '';
      console.log('Name set to:', this.name);
    } catch (e) {
      console.error('Failed to fetch user profile', e);
    }
  }
}
