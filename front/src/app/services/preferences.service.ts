import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, effect, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';

/**
 * Backs the "Allow notifications" and "Share your online status" toggles
 * in the settings side bar with real behavior instead of throwaway UI state:
 *  - Notifications are tied to the actual browser Notification permission,
 *    and preferences.notify() is what other services call to fire one.
 *  - Online status is read by ChatService before opening the presence
 *    websocket: turning it off means the user never shows up as online.
 * Preferences persist per logged-in user in localStorage.
 */
@Injectable({ providedIn: 'root' })
export class PreferencesService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly authService = inject(AuthService);

  readonly allowNotifications = signal<boolean>(false);
  readonly shareOnlineStatus = signal<boolean>(true);
  readonly notificationPermission = signal<NotificationPermission | 'unsupported'>('default');

  constructor() {
    if (!this.isBrowser) return;

    if ('Notification' in window) {
      this.notificationPermission.set(Notification.permission);
    } else {
      this.notificationPermission.set('unsupported');
    }

    // Reload the stored prefs whenever the logged-in user changes (login/logout/switch).
    effect(() => {
      const userId = this.authService.currentUser()?.id ?? 'anon';
      const prefix = this.keyPrefix(userId);

      const storedNotifications = localStorage.getItem(`${prefix}allow-notifications`);
      const permission = 'Notification' in window ? Notification.permission : 'unsupported';
      this.allowNotifications.set(storedNotifications === 'true' && permission === 'granted');

      const storedStatus = localStorage.getItem(`${prefix}share-status`);
      this.shareOnlineStatus.set(storedStatus !== 'false');
    });
  }

  /** Turns notifications on (prompting the browser permission if needed) or off. */
  async setAllowNotifications(next: boolean): Promise<void> {
    if (!this.isBrowser) return;

    if (!next) {
      this.allowNotifications.set(false);
      localStorage.setItem(`${this.currentKeyPrefix()}allow-notifications`, 'false');
      return;
    }

    if (!('Notification' in window)) {
      this.notificationPermission.set('unsupported');
      this.allowNotifications.set(false);
      return;
    }

    const permission = await Notification.requestPermission();
    this.notificationPermission.set(permission);

    const granted = permission === 'granted';
    this.allowNotifications.set(granted);
    localStorage.setItem(`${this.currentKeyPrefix()}allow-notifications`, String(granted));
  }

  setShareOnlineStatus(next: boolean): void {
    this.shareOnlineStatus.set(next);
    if (this.isBrowser) {
      localStorage.setItem(`${this.currentKeyPrefix()}share-status`, String(next));
    }
  }

  /** Fires a real browser notification, respecting the user's preference and permission. */
  notify(title: string, options?: NotificationOptions): void {
    if (!this.isBrowser) return;
    if (!this.allowNotifications()) {
      console.log('[preferences] notify skipped: allowNotifications is off');
      return;
    }
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      console.log('[preferences] notify skipped: permission is', 'Notification' in window ? Notification.permission : 'unsupported');
      return;
    }
    if (document.visibilityState === 'visible' && document.hasFocus()) {
      console.log('[preferences] notify skipped: tab is focused');
      return;
    }

    console.log('[preferences] showing notification:', title);
    new Notification(title, options);
  }

  private currentKeyPrefix(): string {
    return this.keyPrefix(this.authService.currentUser()?.id ?? 'anon');
  }

  private keyPrefix(userId: string): string {
    return `bside:prefs:${userId}:`;
  }
}