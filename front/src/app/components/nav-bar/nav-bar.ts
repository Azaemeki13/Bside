import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SearchBar } from '../search-bar/search-bar';
import { ProfileCard } from '../profile-card/profile-card';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-nav-bar',
  standalone: true,
  imports: [SearchBar, ProfileCard],
  templateUrl: './nav-bar.html',
  styleUrl: './nav-bar.scss',
})
export class NavBar implements OnInit {
  private router = inject(Router);
  public authService = inject(AuthService);
  ngOnInit() {
    this.authService.loadUserProfile();
  }
  get showGreeting(): boolean {
    return this.router.url.includes('home');
  }
}
