import { Component, OnInit, inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { RouterOutlet } from '@angular/router';
import { NavBar } from '../components/nav-bar/nav-bar';
import { SideBar } from '../components/side-bar/side-bar';
import { SoundBar } from './sound-bar/sound-bar';
import { AuthService } from '../services/auth.service';
import { ChatService } from '../services/chat.service';
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
  private readonly chatService = inject(ChatService);

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    let token = localStorage.getItem('auth_token');

    if (!token) {
      token = this.route.snapshot.queryParamMap.get('token') ?? null;

      if (token) {
        localStorage.setItem('auth_token', token);
        history.replaceState(null, '', window.location.pathname);
      }
    }

    if (!token) return;

    this.authService.getCurrentUser().subscribe({
      next: (user) => {
        this.authService.currentUser.set(user);
        this.name = user.username ?? user.email ?? '';
        this.cdr.markForCheck();
        this.chatService.connect();
      },
      error: (error) => {
        console.error('Failed to fetch user profile', error);
      },
    });
  }
}