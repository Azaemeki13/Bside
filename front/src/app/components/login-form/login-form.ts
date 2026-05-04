import { Component } from '@angular/core';
import { LucideAngularModule, Mail, KeyRound } from 'lucide-angular';

@Component({
  selector: 'app-login-form',
  imports: [LucideAngularModule],
  templateUrl: './login-form.html',
  styleUrl: './login-form.scss',
})
export class LoginForm {
  protected readonly mail = Mail;
  protected readonly keyRound = KeyRound;
}