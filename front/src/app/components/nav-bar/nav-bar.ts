import { Component } from '@angular/core';
import { SearchBar } from '../search-bar/search-bar';
import { ProfileCard } from '../profile-card/profile-card';

@Component({
  selector: 'app-nav-bar',
  imports: [SearchBar, ProfileCard],
  templateUrl: './nav-bar.html',
  styleUrl: './nav-bar.scss',
})
export class NavBar {}
