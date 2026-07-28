import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authOrTryMeGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.currentUser()) return true;

  const hasToken = typeof localStorage !== 'undefined' && !!localStorage.getItem('auth_token');
  if (!hasToken) {
    auth.isTryMePopupOpen.set(true);
    return router.createUrlTree(['/bside_app/home']);
  }

  return auth.getCurrentUser().pipe(
    map((user) => {
      auth.currentUser.set(user);
      return true;
    }),
    catchError(() => {
      auth.isTryMePopupOpen.set(true);
      return of(router.createUrlTree(['/bside_app/home']));
    })
  );
};