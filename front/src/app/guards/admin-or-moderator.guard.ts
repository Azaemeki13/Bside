import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../services/auth.service';

const allowedRoles = ['Admin', 'Moderator'];

export const adminOrModeratorGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const currentUser = auth.currentUser();

  if (currentUser) {
    return allowedRoles.includes(currentUser.role)
      ? true
      : router.createUrlTree(['/bside_app/settings']);
  }

  return auth.getCurrentUser().pipe(
    map((user) => {
      auth.currentUser.set(user);
      return allowedRoles.includes(user.role) ? true : router.createUrlTree(['/bside_app/settings']);
    }),
    catchError(() => of(router.createUrlTree(['/bside_app/settings'])))
  );
};