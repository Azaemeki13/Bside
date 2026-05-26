import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SearchBar } from '../search-bar/search-bar';
import { ProfileCard } from '../profile-card/profile-card';
import { AuthService } from '../../services/auth.service';
import { LoginPayload, AuthResponse, RegisterPayload, UserProfile } from '../../models/auth.model';

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
  protected user: UserProfile | null = null;
  ngOnInit() {
    //this.authService.loadUserProfile();
	this.authService.getCurrentUser().subscribe ({
		next:(res) => {
			this.user = res;
			console.log('this.user', this.user);
		},
		error: (err) => {
			console.error('Failed to load current user:', err);
			this.user = null;
		},
	})
  }
  get showGreeting(): boolean {
    return this.router.url.includes('home');
  }
}
