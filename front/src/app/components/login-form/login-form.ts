import { Component } from '@angular/core';
import { NavButton } from '../nav-button/nav-button';
import { LucideAngularModule, Mail, KeyRound } from 'lucide-angular';

@Component({
  selector: 'app-login-form',
  imports: [NavButton, LucideAngularModule],
  templateUrl: './login-form.html',
  styleUrl: './login-form.scss',
})
export class LoginForm {
  protected readonly mail = Mail;
  protected readonly keyRound = KeyRound;
}