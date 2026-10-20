import { Component, ElementRef, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { RecipeService, errorMessage } from './recipe.service';

@Component({
  selector: 'app-recipe-import',
  imports: [FormsModule, RouterLink],
  template: `
    <a routerLink="/" class="back">← All recipes</a>
    <section class="card">
      <h1>Import from URL</h1>
      <p class="muted">Paste a link to a recipe page. Recipig keeps just the ingredients and steps.</p>
      <div class="row">
        <input
          #urlInput
          type="url"
          class="grow"
          placeholder="https://example.com/best-pancakes"
          aria-label="Recipe link"
          [(ngModel)]="url"
          (keydown.enter)="importRecipe()"
          [disabled]="importing()"
        />
        <button type="button" class="btn primary" (click)="importRecipe()" [disabled]="importing() || !url.trim()">
          {{ importing() ? 'Importing…' : 'Import' }}
        </button>
      </div>
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
    </section>
  `,
})
export class RecipeImport {
  private readonly service = inject(RecipeService);
  private readonly router = inject(Router);
  private readonly input = viewChild<ElementRef<HTMLInputElement>>('urlInput');

  readonly importing = signal(false);
  readonly error = signal('');
  url = '';

  constructor() {
    afterNextRender(() => this.input()?.nativeElement.focus());
  }

  async importRecipe(): Promise<void> {
    const url = this.url.trim();
    if (!url || this.importing()) return;
    this.error.set('');
    this.importing.set(true);
    try {
      const recipe = await firstValueFrom(this.service.importFromUrl(url));
      await this.router.navigate(['/recipes', recipe.id]);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.importing.set(false);
    }
  }
}
