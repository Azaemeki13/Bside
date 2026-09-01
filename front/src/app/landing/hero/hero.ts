import { Component } from '@angular/core';
import { NavButton } from '../../core/layout/nav-button/nav-button';

@Component({
  selector: 'app-hero',
  imports: [NavButton],
  templateUrl: './hero.html',
  styleUrl: './hero.scss',
})
export class Hero {}
