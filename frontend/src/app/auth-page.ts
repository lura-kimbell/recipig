import { Component, ElementRef, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from './auth.service';
import { safeReturnUrl } from './auth.util';
import { errorMessage } from './recipe.service';

/** One page for both forms: route data `{ mode: 'register' }` makes it the create-account form. */
@Component({
  selector: 'app-auth-page',
  imports: [FormsModule, RouterLink],
  template: `
    <section class="card auth-card">
      <h1>{{ registering ? 'Create account' : 'Log in' }}</h1>
      <p class="muted">
        {{ registering ? 'Pick a username and a password. No email needed.' : 'Welcome back! Log in to see your recipes.' }}
      </p>
      <form (ngSubmit)="submit()" class="auth-form">
        <label class="field">
          Username
          <input
            #usernameInput
            type="text"
            name="username"
            autocomplete="username"
            autocapitalize="none"
            spellcheck="false"
            [(ngModel)]="username"
            [disabled]="busy()"
          />
        </label>
        <label class="field">
          Password
          <input
            type="password"
            name="password"
            [attr.autocomplete]="registering ? 'new-password' : 'current-password'"
            [(ngModel)]="password"
            [disabled]="busy()"
          />
        </label>
        @if (registering) {
          <label class="field">
            Type the password again
            <input type="password" name="confirm" autocomplete="new-password" [(ngModel)]="confirm" [disabled]="busy()" />
          </label>
          <p class="muted">There's no way to reset a forgotten password, so choose one you'll remember.</p>
        }
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        <div class="actions">
          <button type="submit" class="btn primary" [disabled]="busy()">
            {{ busy() ? 'One moment…' : registering ? 'Create account' : 'Log in' }}
          </button>
        </div>
      </form>
      <p class="muted auth-switch">
        @if (registering) {
          Already have an account? <a routerLink="/login" [queryParams]="returnParams()">Log in</a>
        } @else {
          New here? <a routerLink="/register" [queryParams]="returnParams()">Create an account</a>
        }
      </p>
    </section>
  `,
})
export class AuthPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly input = viewChild<ElementRef<HTMLInputElement>>('usernameInput');

  readonly registering = this.route.snapshot.data['mode'] === 'register';
  readonly busy = signal(false);
  readonly error = signal('');
  username = '';
  password = '';
  confirm = '';

  constructor() {
    afterNextRender(() => this.input()?.nativeElement.focus());
  }

  returnParams(): { returnUrl?: string } {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    return returnUrl ? { returnUrl } : {};
  }

  async submit(): Promise<void> {
    if (this.busy()) return;
    this.error.set('');
    const username = this.username.trim();
    if (!username) return this.error.set('Please enter a username.');
    if (!this.password) return this.error.set('Please enter a password.');
    if (this.registering && this.password !== this.confirm) return this.error.set("The two passwords don't match.");

    this.busy.set(true);
    try {
      if (this.registering) await this.auth.register(username, this.password);
      else await this.auth.login(username, this.password);
      await this.router.navigateByUrl(safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl')));
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
