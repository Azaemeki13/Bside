import { HttpInterceptorFn } from "@angular/common/http";
import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from "@angular/common";
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
    const platformId = inject(PLATFORM_ID);
    const router = inject(Router);
    let token: string | null = null;
    if (isPlatformBrowser(platformId)) {
        token = localStorage.getItem('auth_token');
    }
    const clonedReq = token
        ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
        : req;

    return next(clonedReq).pipe(
        catchError((error) => {
            if (isPlatformBrowser(platformId) && error?.status === 403 && error?.error === 'Your account has been banned.') {
                localStorage.removeItem('auth_token');
                void router.navigate(['/login'], { queryParams: { error: 'banned' } });
            }
            return throwError(() => error);
        })
    );
};