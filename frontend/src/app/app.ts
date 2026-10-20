import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

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
              <li><a routerLink="/recipes/new" (click)="closeMenu()">Create New Recipe</a></li>
              <li><a routerLink="/import" (click)="closeMenu()">Import from URL</a></li>
            </ul>
          }
        </div>
      </div>
    </header>
    <main class="container">
      <router-outlet />
    </main>
  `,
})
export class App {
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

  /** Clicking anywhere outside the button and its menu closes the menu. */
  onDocumentClick(event: Event): void {
    const wrap = this.host.nativeElement.querySelector('.menu-wrap');
    if (wrap && !wrap.contains(event.target as Node)) this.closeMenu();
  }
}
