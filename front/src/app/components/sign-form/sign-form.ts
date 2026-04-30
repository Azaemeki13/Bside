import { Component } from '@angular/core';
import { LucideAngularModule, Mail, KeyRound, UserRound } from 'lucide-angular';
import { NavButton } from '../nav-button/nav-button';

@Component({
  selector: 'app-sign-form',
  imports: [LucideAngularModule, NavButton],
  templateUrl: './sign-form.html',
  styleUrl: './sign-form.scss',
})
export class SignForm {
  protected readonly mail = Mail;
  protected readonly keyRound = KeyRound;
  protected readonly userRound = UserRound;
}
