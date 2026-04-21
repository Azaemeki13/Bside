import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-landing',
  imports: [],
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
