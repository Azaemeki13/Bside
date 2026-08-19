import { Component, inject } from '@angular/core';
import { ChevronDown, LucideAngularModule } from 'lucide-angular';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { environment } from '../../../environment';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-footer',
  imports: [LucideAngularModule, FormsModule, CommonModule, RouterLink],
  templateUrl: './footer.html',
  styleUrl: './footer.scss',
})
export class Footer {
  protected readonly chevronDown = ChevronDown;
  private http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;
  contactData = {
    name: '',
    email: '',
    message: ''
  };
  isSubmitting= false;
  successMessage = '';
  errorMessage = '';
  onSubmit() {
    const name = this.contactData.name.trim();
    const email = this.contactData.email.trim().toLowerCase();
    const message = this.contactData.message.trim();
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const nameLength = [...name].length;
    const messageLength = [...message].length;
    if (nameLength < 1 || nameLength > 100 || !validEmail || messageLength < 10 || messageLength > 5000) {
      this.errorMessage = "Enter a valid name and email, and a message between 10 and 5000 characters.";
      return;
    }
    this.isSubmitting = true;
    this.errorMessage = '';
    this.http.post(`${this.apiUrl}/contact`, { name, email, message }, { responseType: 'text' }).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.successMessage = "Message sent successfully !";
        this.contactData = { name: '', email: '', message: '' };
      },
      error: (err) => {
        this.isSubmitting = false;
        this.errorMessage = "Failed to send message. Please try again.";
        console.error(err);
      }
    });
  }
}
