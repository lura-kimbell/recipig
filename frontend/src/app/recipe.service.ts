import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Recipe, RecipeDraft } from './models';

@Injectable({ providedIn: 'root' })
export class RecipeService {
  private readonly http = inject(HttpClient);

  list() {
    return this.http.get<Recipe[]>('/api/recipes');
  }

  get(id: string) {
    return this.http.get<Recipe>(`/api/recipes/${encodeURIComponent(id)}`);
  }

  create(recipe: RecipeDraft) {
    return this.http.post<Recipe>('/api/recipes', recipe);
  }

  importFromUrl(url: string) {
    return this.http.post<Recipe>('/api/recipes/import', { url });
  }

  save(recipe: Recipe) {
    return this.http.put<Recipe>(`/api/recipes/${encodeURIComponent(recipe.id)}`, recipe);
  }

  remove(id: string) {
    return this.http.delete<void>(`/api/recipes/${encodeURIComponent(id)}`);
  }
}

/** A friendly message for any error coming back from the API. */
export function errorMessage(e: unknown): string {
  if (e instanceof HttpErrorResponse) {
    const apiMessage = e.error?.error;
    if (typeof apiMessage === 'string') return apiMessage;
    if (e.status === 0) return "Couldn't reach the Recipig server. Is the backend running?";
  }
  return 'Something went wrong. Please try again.';
}

/** "https://www.example.com/x" -> "example.com", or '' if there is no usable link. */
export function hostOf(url?: string): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** A unique id for new list items (randomUUID needs a secure context, so keep a fallback). */
export function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
}
