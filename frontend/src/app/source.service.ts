import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { Source, SourceIcon } from './models';

/** The CSS mask image for a source icon (the files are in public/source-icons). */
export const sourceIconUrl = (icon: SourceIcon): string => `url('/source-icons/${icon}.svg')`;

const byName = (a: Source, b: Source) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

/**
 * The logged-in cook's sources (cookbooks, websites and so on they label recipes with),
 * fetched once and shared by the list, recipe page and editor.
 */
@Injectable({ providedIn: 'root' })
export class SourceService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  readonly sources = signal<Source[]>([]);
  readonly byId = computed(() => new Map(this.sources().map((s) => [s.id, s])));
  private loading: Promise<void> | null = null;

  constructor() {
    // Someone else logging in on this tab has their own sources.
    effect(() => {
      this.auth.user();
      this.loading = null;
      this.sources.set([]);
    });
  }

  /** Fetch the sources unless they already have been. */
  load(): Promise<void> {
    this.loading ??= firstValueFrom(this.http.get<Source[]>('/api/sources')).then(
      (list) => this.sources.set(list),
      (e) => {
        this.loading = null;
        throw e;
      },
    );
    return this.loading;
  }

  async create(input: Omit<Source, 'id'>): Promise<Source> {
    const created = await firstValueFrom(this.http.post<Source>('/api/sources', input));
    this.sources.update((list) => [...list, created].sort(byName));
    return created;
  }

  async update(id: string, input: Omit<Source, 'id'>): Promise<Source> {
    const updated = await firstValueFrom(this.http.put<Source>(`/api/sources/${encodeURIComponent(id)}`, input));
    this.sources.update((list) => list.map((s) => (s.id === id ? updated : s)).sort(byName));
    return updated;
  }

  /** Deletes the source; recipes that had it keep everything else. */
  async remove(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`/api/sources/${encodeURIComponent(id)}`));
    this.sources.update((list) => list.filter((s) => s.id !== id));
  }
}
