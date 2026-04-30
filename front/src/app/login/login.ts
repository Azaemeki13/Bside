import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { LoginForm } from '../components/login-form/login-form';

@Component({
  selector: 'app-login',
  imports: [LoginForm, RouterModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {}
