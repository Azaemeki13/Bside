import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { AdminService } from '../../services/admin.service';
import { UserProfile } from '../../models/auth.model';
import { displayName } from '../../models/chat.model';

@Component({
  selector: 'app-admin-users',
  imports: [CommonModule],
  templateUrl: './admin-users.html',
  styleUrl: './admin-users.scss',
})
export class AdminUsers implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly authService = inject(AuthService);

  readonly roles: Array<'Admin' | 'Moderator' | 'User'> = ['Admin', 'Moderator', 'User'];

  users: UserProfile[] = [];
  isLoading = false;
  message = '';
  error = '';
  actingUserId: string | null = null;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.isLoading = true;
    this.error = '';
    this.admin.getUsers().subscribe({
      next: (users) => {
        this.users = users;
        this.isLoading = false;
      },
      error: () => {
        this.error = 'Could not load users. Admin role is required.';
        this.isLoading = false;
      },
    });
  }

  nameFor(user: UserProfile): string {
    return displayName(user.username, user.display_name);
  }

  isSelf(user: UserProfile): boolean {
    return user.id === this.authService.currentUser()?.id;
  }

  toggleBan(user: UserProfile): void {
    this.message = '';
    this.error = '';
    this.actingUserId = user.id;

    const request = user.is_banned ? this.admin.unbanUser(user.id) : this.admin.banUser(user.id);

    request.subscribe({
      next: (updated) => {
        this.users = this.users.map((item) => (item.id === updated.id ? updated : item));
        this.message = updated.is_banned
          ? `${this.nameFor(updated)} was banned.`
          : `${this.nameFor(updated)} was unbanned.`;
        this.actingUserId = null;
      },
      error: () => {
        this.error = `Could not ${user.is_banned ? 'unban' : 'ban'} this user.`;
        this.actingUserId = null;
      },
    });
  }

  changeRole(user: UserProfile, role: 'Admin' | 'Moderator' | 'User'): void {
    if (role === user.role) return;
    this.message = '';
    this.error = '';
    this.actingUserId = user.id;

    this.admin.updateUser(user.id, { role }).subscribe({
      next: (updated) => {
        this.users = this.users.map((item) => (item.id === updated.id ? updated : item));
        this.message = `${this.nameFor(updated)} is now ${updated.role}.`;
        this.actingUserId = null;
      },
      error: () => {
        this.error = `Could not change role for ${this.nameFor(user)}.`;
        this.actingUserId = null;
      },
    });
  }

  deleteUser(user: UserProfile): void {
    if (!confirm(`Permanently delete ${this.nameFor(user)}? This cannot be undone.`)) {
      return;
    }
    this.message = '';
    this.error = '';
    this.actingUserId = user.id;

    this.admin.deleteUser(user.id).subscribe({
      next: () => {
        this.users = this.users.filter((item) => item.id !== user.id);
        this.message = `${this.nameFor(user)} was deleted.`;
        this.actingUserId = null;
      },
      error: (err) => {
        this.error =
          err?.status === 409
            ? `${this.nameFor(user)} owns an artist profile and cannot be deleted.`
            : `Could not delete ${this.nameFor(user)}.`;
        this.actingUserId = null;
      },
    });
  }
}
