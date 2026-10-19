import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Recipe } from './models';
import { RecipeService, errorMessage, hostOf } from './recipe.service';

@Component({
  selector: 'app-recipe-list',
  imports: [FormsModule, RouterLink],
  template: `
    <section class="card">
      <h1>Import a recipe</h1>
      <p class="muted">Paste a link to a recipe page. Recipig keeps just the ingredients and steps.</p>
      <div class="row">
        <input
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

    <h2>Your recipes</h2>
    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else if (recipes().length === 0) {
      <p class="muted">Nothing saved yet. Import your first recipe above.</p>
    } @else {
      <ul class="grid">
        @for (r of recipes(); track r.id) {
          <li>
            <a class="card recipe-card" [routerLink]="['/recipes', r.id]">
              @if (r.image) {
                <img [src]="r.image" alt="" loading="lazy" referrerpolicy="no-referrer" />
              }
              <h3>{{ r.title }}</h3>
              <p class="muted small">{{ r.ingredients.length }} ingredients · {{ r.steps.length }} steps</p>
              @if (host(r.sourceUrl)) {
                <p class="muted small">{{ host(r.sourceUrl) }}</p>
              }
            </a>
          </li>
        }
      </ul>
    }
  `,
})
export class RecipeList implements OnInit {
  private readonly service = inject(RecipeService);
  private readonly router = inject(Router);

  readonly recipes = signal<Recipe[]>([]);
  readonly loading = signal(true);
  readonly importing = signal(false);
  readonly error = signal('');
  url = '';

  readonly host = hostOf;

  async ngOnInit(): Promise<void> {
    try {
      this.recipes.set(await firstValueFrom(this.service.list()));
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  async importRecipe(): Promise<void> {
    const url = this.url.trim();
    if (!url || this.importing()) return;
    this.error.set('');
    this.importing.set(true);
    try {
      const recipe = await firstValueFrom(this.service.importFromUrl(url));
      this.url = '';
      await this.router.navigate(['/recipes', recipe.id]);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.importing.set(false);
    }
  }
}
