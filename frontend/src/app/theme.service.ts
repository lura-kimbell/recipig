import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
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
  /** Themes in which recipe photos are hidden (a per-theme choice, kept on the account). */
  readonly hideImagesIn = signal<ThemeId[]>([]);
  /** Whether the theme showing now hides recipe photos. */
  readonly imagesHidden = computed(() => this.hideImagesIn().includes(this.current()));

  constructor() {
    this.apply(this.current());
    // styles.css hides the card thumbnails and the recipe page photo under this attribute.
    effect(() => document.documentElement.toggleAttribute('data-hide-images', this.imagesHidden()));
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

  /** Hide or show recipe photos in one theme, and save the choice on the account. */
  async setImagesHidden(theme: ThemeId, hidden: boolean): Promise<void> {
    const before = this.hideImagesIn();
    const next = THEMES.map((t) => t.id).filter((t) => (t === theme ? hidden : before.includes(t)));
    this.hideImagesIn.set(next);
    try {
      await firstValueFrom(this.http.put('/api/auth/hide-images', { themes: next }));
    } catch (e) {
      this.hideImagesIn.set(before);
      throw e;
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
