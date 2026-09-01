import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SignForm } from '../core/auth/sign-form/sign-form';

@Component({
  selector: 'app-signup',
  imports: [SignForm, RouterModule],
  templateUrl: './signup.html',
  styleUrl: './signup.scss',
})
export class Signup {}
