import { Component } from '@angular/core';
import { LucideAngularModule, Mail, KeyRound, UserRound } from 'lucide-angular';

@Component({
  selector: 'app-sign-form',
  imports: [LucideAngularModule],
  templateUrl: './sign-form.html',
  styleUrl: './sign-form.scss',
})
export class SignForm {
  protected readonly mail = Mail;
  protected readonly keyRound = KeyRound;
  protected readonly userRound = UserRound;
}
