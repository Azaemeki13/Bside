import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideAngularModule, Mail, KeyRound, UserRound } from 'lucide-angular';
import { AuthService } from '../../services/auth.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-sign-form',
  standalone: true,
  imports: [LucideAngularModule, ReactiveFormsModule, CommonModule],
  templateUrl: './sign-form.html',
  styleUrl: './sign-form.scss',
})
export class SignForm {
  isLoading = false;
  protected readonly authService = inject(AuthService);
  protected readonly mail = Mail;
  protected readonly keyRound = KeyRound;
  protected readonly userRound = UserRound;
  private router = inject(Router);
  private fb = inject(FormBuilder);
  protected registerForm = this.fb.nonNullable.group({
    username: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]]
  });
  protected errorMessage = '';
  protected onSubmit(): void {
    if (this.registerForm.invalid) return;
    this.isLoading = true;
    this.errorMessage = '';
    const formValues = this.registerForm.getRawValue();
    this.authService.registerAndLogin(formValues).subscribe({
      next: () => {
        this.authService.loadUserProfile();
        this.router.navigate(['/bside_app/home']);
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = 'Registration failed. Email might already be in use.';
        console.error(err);
      }
    });
  }
}