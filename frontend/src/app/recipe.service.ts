import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Recipe, RecipeDraft } from './models';

/** One photo of a cookbook page, resized in the browser, as base64 without a data: prefix. */
export interface PhotoUpload {
  mediaType: 'image/jpeg';
  data: string;
}

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

  /** Reads a recipe from photos; returns an unsaved draft for the editor. */
  importFromPhotos(photos: PhotoUpload[]) {
    return this.http.post<RecipeDraft>('/api/recipes/import-photos', { photos });
  }

  /** Uploads a recipe photo (already shrunk); resolves to the address to use as the recipe's image. */
  async uploadImage(photo: Blob): Promise<string> {
    const { url } = await firstValueFrom(
      this.http.post<{ url: string }>('/api/images', photo, { headers: { 'Content-Type': photo.type || 'image/jpeg' } }),
    );
    return url;
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

/** Whether an image address is a photo uploaded to Recipig (backend/src/images.ts) rather than a link. */
export function isUploadedImage(url?: string): boolean {
  return !!url && /^\/api\/images\/[0-9a-f-]{36}$/.test(url);
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
