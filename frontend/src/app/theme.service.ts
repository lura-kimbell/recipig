import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** The app's looks, in the order the picker shows them. Must match THEMES in backend/src/stores.ts. */
export const THEMES = [
  { id: 'friendly', name: 'Friendly', description: 'A cosy pastel village with a polka-dot meadow.', barColor: '#ffd5e1' },
  { id: 'aurora', name: 'Aurora', description: 'Northern lights over a starry night sky.', barColor: '#01030a' },
  { id: 'terminal', name: 'Terminal', description: 'Green on dark, in a monospace font.', barColor: '#0a0a0a' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

const STORAGE_KEY = 'recipig-theme';

export const isThemeId = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);

/**
 * Which theme is showing. The choice is saved on the account (so it follows you
 * between devices) and in this browser, so the page starts in the right theme
 * before anyone has logged in (index.html reads it before Angular starts).
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly http = inject(HttpClient);

  readonly current = signal<ThemeId>(readStored() ?? 'friendly');

  constructor() {
    this.apply(this.current());
  }

  /** Show a theme on this device. */
  apply(theme: ThemeId): void {
    this.current.set(theme);
    document.documentElement.dataset['theme'] = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEMES.find((t) => t.id === theme)!.barColor);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Private browsing or storage turned off: the theme still applies for this visit.
    }
  }

  /** Show a theme and save it on the logged-in account. */
  async choose(theme: ThemeId): Promise<void> {
    this.apply(theme);
    await firstValueFrom(this.http.put('/api/auth/theme', { theme }));
  }
}

function readStored(): ThemeId | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isThemeId(stored) ? stored : null;
  } catch {
    return null;
  }
}
