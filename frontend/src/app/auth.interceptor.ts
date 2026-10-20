import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * If the server says "not logged in" (say the session expired in another tab),
 * forget the user and go to the login page. The auth calls themselves are left
 * alone: a wrong password is a 401 too, and the login form shows that message.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return next(req).pipe(
    tap({
      error: (e: unknown) => {
        if (!(e instanceof HttpErrorResponse) || e.status !== 401 || req.url.startsWith('/api/auth/')) return;
        auth.user.set(null);
        const path = router.url.split(/[?#]/)[0];
        if (path === '/login' || path === '/register') return;
        void router.navigate(['/login'], { queryParams: router.url === '/' ? {} : { returnUrl: router.url } });
      },
    }),
  );
};
