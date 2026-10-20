import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Recipe pages need a login; anyone else is sent to the login page and brought back afterwards. */
export const authGuard: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  if (inject(AuthService).user()) return true;
  return router.createUrlTree(['/login'], { queryParams: state.url === '/' ? {} : { returnUrl: state.url } });
};

/** The login and create-account pages are pointless once you're logged in. */
export const guestGuard: CanActivateFn = () => {
  const router = inject(Router);
  return inject(AuthService).user() ? router.createUrlTree(['/']) : true;
};
