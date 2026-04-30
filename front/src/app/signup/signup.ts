import { Component } from '@angular/core';
import { SignForm } from '../components/sign-form/sign-form';

@Component({
  selector: 'app-signup',
  imports: [SignForm],
  templateUrl: './signup.html',
  styleUrl: './signup.scss',
})
export class Signup {}
