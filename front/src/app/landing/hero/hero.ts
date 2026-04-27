import { Component } from '@angular/core';
import { NavButton } from '../../components/nav-button/nav-button';

@Component({
  selector: 'app-hero',
  imports: [NavButton],
  templateUrl: './hero.html',
  styleUrl: './hero.scss',
})
export class Hero {}
