import { Component, inject } from '@angular/core';
import { LucideAngularModule, Mail, KeyRound } from 'lucide-angular';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService  } from '../../services/auth.service';

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
    identifier: ['', Validators.required],
    password: ['', Validators.required]
  });
  errorMessage: string | null = null;
  isLoading = false;

  onSubmit() {
    if (this.loginForm.invalid) return;
    this.isLoading = true;
    this.errorMessage = null;
    const payload = {
      identifier: this.loginForm.value.identifier!,
      password: this.loginForm.value.password!
    };
    this.authService.login(payload).subscribe({
      next: () => {
        this.router.navigate(['/bside_app']);
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = 'Invalid username or password.';
        console.error("Login Failed:", err);
      }
    });
  }
}