import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Header } from './header/header';
import { Hero } from './hero/hero';
import { Features } from './features/features';
import { Carousel } from './carousel/carousel';
import { Cta } from './cta/cta';
import { Faq } from './faq/faq';
import { Footer } from './footer/footer';

@Component({
  selector: 'app-landing',
  imports: [
    Header,
    Hero,
    Features,
    Carousel,
    Cta,
    Faq,
    Footer
  ],
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
})
export class LandingComponent {
  constructor(private router: Router) {}

  goToLogin(){
    this.router.navigate(['/login']);
  }

  goToSignup(){
    this.router.navigate(['signup']);
  }
}
