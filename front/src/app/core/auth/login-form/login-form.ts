import { Component, Input, inject } from '@angular/core';
import { LucideAngularModule, Mail, KeyRound } from 'lucide-angular';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService  } from '../../../services/auth.service';

/** Collects sign-in details and hands authentication feedback back to the user. */
@Component({
  selector: 'app-login-form',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, LucideAngularModule],
  templateUrl: './login-form.html',
  styleUrl: './login-form.scss',
})
export class LoginForm {
  readonly mail = Mail;
  readonly keyRound = KeyRound;
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  loginForm = this.fb.group({
    identifier: ['', [Validators.required, Validators.maxLength(254)]],
    password: ['', [Validators.required, Validators.maxLength(128)]]
  });
  errorMessage: string | null = null;
  isLoading = false;

  @Input() set externalError(value: string | null) {
    if (value) {
      this.errorMessage = value;
    }
  }

  onSubmit() {
    if (this.loginForm.invalid) return;
    this.isLoading = true;
    this.errorMessage = null;
    const payload = {
      identifier: this.loginForm.value.identifier!.trim(),
      password: this.loginForm.value.password!
    };
    this.authService.login(payload).subscribe({
      next: () => {
        this.authService.loadUserProfile();
        this.router.navigate(['/bside_app']);
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = err?.status === 403 && typeof err?.error === 'string'
          ? err.error
          : 'Invalid username or password.';
        console.error("Login Failed:", err);
      }
    });
  }
}
