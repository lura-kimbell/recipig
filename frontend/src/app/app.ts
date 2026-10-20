import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'closeMenu(true)',
  },
  template: `
    <header class="topbar">
      <div class="topbar-inner">
        <a routerLink="/" class="brand">🐷 Recipig</a>
        @if (auth.user(); as user) {
          <div class="topbar-actions">
            <div class="menu-wrap">
              <button
                #toggle
                type="button"
                class="btn primary"
                aria-controls="new-recipe-menu"
                [attr.aria-expanded]="menuOpen()"
                (click)="toggleMenu()"
              >
                New Recipe <span aria-hidden="true">▾</span>
              </button>
              @if (menuOpen()) {
                <ul id="new-recipe-menu" class="menu">
                  <li><a routerLink="/recipes/new" (click)="closeMenu()">From Scratch</a></li>
                  <li><a routerLink="/import" (click)="closeMenu()">From URL</a></li>
                </ul>
              }
            </div>
            <span class="whoami">
              <span class="whoami-name" title="Logged in as {{ user.username }}">{{ user.username }}</span>
              <button type="button" class="btn small" (click)="logout()">Log out</button>
            </span>
          </div>
        } @else {
          <nav class="topbar-actions" aria-label="Account">
            <a routerLink="/login" class="btn">Log in</a>
            <a routerLink="/register" class="btn primary">Create account</a>
          </nav>
        }
      </div>
    </header>
    <main class="container">
      <router-outlet />
    </main>
  `,
})
export class App {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly toggle = viewChild<ElementRef<HTMLButtonElement>>('toggle');

  readonly menuOpen = signal(false);

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  closeMenu(refocus = false): void {
    if (!this.menuOpen()) return;
    this.menuOpen.set(false);
    if (refocus) this.toggle()?.nativeElement.focus();
  }

  async logout(): Promise<void> {
    this.closeMenu();
    try {
      await this.auth.logout();
    } finally {
      await this.router.navigate(['/login']);
    }
  }

  /** Clicking anywhere outside the button and its menu closes the menu. */
  onDocumentClick(event: Event): void {
    const wrap = this.host.nativeElement.querySelector('.menu-wrap');
    if (wrap && !wrap.contains(event.target as Node)) this.closeMenu();
  }
}
