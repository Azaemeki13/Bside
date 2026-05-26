import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NavButton } from '../nav-button/nav-button'
import { Router } from '@angular/router';
import { LucideAngularModule, Mail, KeyRound, UserRound } from 'lucide-angular';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-sign-form',
  standalone: true,
  imports: [LucideAngularModule, ReactiveFormsModule, NavButton],
  templateUrl: './sign-form.html',
  styleUrl: './sign-form.scss',
})
export class SignForm {
  protected readonly mail = Mail;
  protected readonly keyRound = KeyRound;
  protected readonly userRound = UserRound;

  private authService = inject(AuthService);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  protected registerForm = this.fb.nonNullable.group({
    username: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]]
  });
  protected errorMessage= '';
  protected onSubmit(): void {
    if (this.registerForm.invalid) {
      return;
    }
    const formValues = this.registerForm.getRawValue();
    this.authService.registerAndLogin(formValues).subscribe({
      next: () => {
        console.log("Registration and login successful !");
        this.authService.loadUserProfile();
        this.router.navigate(['/bside_app/home']);
      },
      error: (err) => {
        this.errorMessage = 'Registration failed. Email might already be in use.';
        console.error(err);
      }
    });
  }
}
