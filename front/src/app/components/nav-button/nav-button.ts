import { Component, Input } from '@angular/core';
import { RouterModule } from '@angular/router';
import { NgClass } from '@angular/common';

@Component({
  selector: 'nav-button',
  templateUrl: './nav-button.html',
  styleUrl: './nav-button.scss',
  imports: [RouterModule, NgClass]
})
export class NavButton {
  @Input() label = '';
  @Input() link = '';
  @Input() variant = 'light-pink';
  @Input() fontSize = 'text-base';
  @Input() fontStyle = 'font-normal';

  get isExternal(): boolean {
    return this.link.startsWith('http');
  }

  get variantClass(): string {
    if (this.variant === 'raspberry') {
      return 'bg-[#8C0750] text-[#FFE6DB]';
    }

    if (this.variant === 'strawberry') {
      return 'border border-[#FFE6DB] bg-[#FFE6DB]/20 text-[#FFE6DB]';
    }

    return 'bg-[#FFE6DB] text-[#8C0750]';
  }
}