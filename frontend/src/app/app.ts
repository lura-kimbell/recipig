import { Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from './auth.service';
import { ImportDialog } from './import-dialog';
import { ThemePicker } from './theme-picker';
import { ThemeService, isThemeId } from './theme.service';

type MenuName = 'new' | 'user';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, ThemePicker, ImportDialog],
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'closeMenu(true)',
  },
  template: `
    <header class="topbar">
      <div class="topbar-inner">
        <a routerLink="/" class="brand">
          <span class="brand-icon" aria-hidden="true"></span>
          <span class="brand-name">Recipig</span>
        </a>
        @if (auth.user(); as user) {
          <div class="topbar-actions">
            <div class="menu-wrap">
              <button
                #newToggle
                type="button"
                class="btn primary"
                aria-controls="new-recipe-menu"
                [attr.aria-expanded]="openMenu() === 'new'"
                (click)="toggleMenu('new')"
              >
                New Recipe <span aria-hidden="true">▾</span>
              </button>
              @if (openMenu() === 'new') {
                <ul id="new-recipe-menu" class="menu">
                  <li><a routerLink="/recipes/new" (click)="closeMenu()">From Scratch</a></li>
                  <li><button type="button" (click)="openImport()">From URL</button></li>
                </ul>
              }
            </div>
            <div class="menu-wrap">
              <button
                #userToggle
                type="button"
                class="btn user-toggle"
                aria-controls="user-menu"
                [attr.aria-expanded]="openMenu() === 'user'"
                [attr.aria-label]="'Account menu for ' + user.username"
                (click)="toggleMenu('user')"
              >
                <span class="user-icon" aria-hidden="true"></span>
                <span class="whoami-name">{{ user.username }}</span> <span aria-hidden="true">▾</span>
              </button>
              @if (openMenu() === 'user') {
                <ul id="user-menu" class="menu">
                  <li><button type="button" (click)="openThemePicker()">Change theme</button></li>
                  <li role="separator"><hr /></li>
                  <li><button type="button" (click)="logout()">Log out</button></li>
                </ul>
              }
            </div>
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
    <app-theme-picker />
    <app-import-dialog />
  `,
})
export class App {
  protected readonly auth = inject(AuthService);
  private readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly newToggle = viewChild<ElementRef<HTMLButtonElement>>('newToggle');
  private readonly userToggle = viewChild<ElementRef<HTMLButtonElement>>('userToggle');
  private readonly themePicker = viewChild.required(ThemePicker);
  private readonly importDialog = viewChild.required(ImportDialog);

  readonly openMenu = signal<MenuName | null>(null);

  constructor() {
    // Logging in (or coming back logged in) brings the account's theme with it.
    effect(() => {
      const theme = this.auth.user()?.theme;
      if (isThemeId(theme)) this.theme.apply(theme);
    });
  }

  toggleMenu(name: MenuName): void {
    this.openMenu.update((open) => (open === name ? null : name));
  }

  closeMenu(refocus = false): void {
    const open = this.openMenu();
    if (!open) return;
    this.openMenu.set(null);
    if (refocus) (open === 'new' ? this.newToggle() : this.userToggle())?.nativeElement.focus();
  }

  openImport(): void {
    this.closeMenu();
    this.importDialog().open();
  }

  openThemePicker(): void {
    this.closeMenu();
    this.themePicker().open();
  }

  async logout(): Promise<void> {
    this.closeMenu();
    try {
      await this.auth.logout();
    } finally {
      await this.router.navigate(['/login']);
    }
  }

  /** Clicking anywhere outside the open menu and its button closes it. */
  onDocumentClick(event: Event): void {
    const inside = [...this.host.nativeElement.querySelectorAll('.menu-wrap')].some((wrap) =>
      wrap.contains(event.target as Node),
    );
    if (!inside) this.closeMenu();
  }
}
