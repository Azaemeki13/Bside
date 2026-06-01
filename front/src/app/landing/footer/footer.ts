import { Component, inject } from '@angular/core';
import { ChevronDown, LucideAngularModule } from 'lucide-angular';
import { NavButton } from '../../components/nav-button/nav-button';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-footer',
  imports: [LucideAngularModule, NavButton, FormsModule, CommonModule],
  templateUrl: './footer.html',
  styleUrl: './footer.scss',
})
export class Footer {
  protected readonly chevronDown = ChevronDown;
  private http = inject(HttpClient);
  contactData = {
    name: '',
    email: '',
    message: ''
  };
  isSubmitting= false;
  successMessage = '';
  errorMessage = '';
  onSubmit() {
    if (!this.contactData.name || !this.contactData.email || !this.contactData.message) {
      this.errorMessage = "Please fill in all fields.";
      return;
    }
    this.isSubmitting = true;
    this.errorMessage = '';
    this.http.post('http://localhost:8080/contact', this.contactData, { responseType: 'text' }).subscribe({
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
