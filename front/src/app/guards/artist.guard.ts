import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { catchError, map, of } from 'rxjs';

export const artistGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const currentUser = auth.currentUser();

  if (currentUser) {
    return currentUser.role === 'Artist' || currentUser.role === 'Admin' ? true : router.createUrlTree(['/bside_app/settings']);
  }

  return auth.getCurrentUser().pipe(
    map((user) => {
      auth.currentUser.set(user);
      return user.role === 'Artist' || user.role === 'Admin' ? true : router.createUrlTree(['/bside_app/settings']);
    }),
    catchError(() => of(router.createUrlTree(['/bside_app/settings'])))
  );
};
