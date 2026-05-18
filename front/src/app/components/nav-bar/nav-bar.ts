import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SearchBar } from '../search-bar/search-bar';
import { ProfileCard } from '../profile-card/profile-card';

@Component({
  selector: 'app-nav-bar',
  imports: [SearchBar, ProfileCard],
  templateUrl: './nav-bar.html',
  styleUrl: './nav-bar.scss',
})
export class NavBar {
  private router = inject(Router);

  get showGreeting(): boolean {
    return this.router.url.includes('home');
  }
}
