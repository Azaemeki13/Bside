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
  @Input() variant = 'primary';

  get isExternal(): boolean {
    return this.link.startsWith('http');
  }
}