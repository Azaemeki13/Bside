import { Component, inject } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideAngularModule, Mail, KeyRound, UserRound } from 'lucide-angular';
import { AuthService } from '../../../services/auth.service';
import { CommonModule } from '@angular/common';

function unicodeLength(min: number, max: number) {
  return (control: AbstractControl<string>): ValidationErrors | null => {
    const length = [...control.value].length;
    return length >= min && length <= max ? null : { unicodeLength: { min, max, actual: length } };
  };
}

/** Guides a new listener through account creation and friendly validation. */
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
    username: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(30), Validators.pattern(/^[A-Za-z0-9_-]+$/)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, unicodeLength(8, 128), Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/)]]
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
