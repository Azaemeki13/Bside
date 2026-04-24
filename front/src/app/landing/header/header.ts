import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NavButton } from '../../components/nav-button/nav-button';

@Component({
  selector: 'app-header',
  imports: [NavButton, RouterLink],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {}
