import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Recipe } from './models';
import { RecipeService, errorMessage, hostOf } from './recipe.service';

const PLACEHOLDER_EMOJI = ['🍳', '🥕', '🍰', '🍓', '🥐', '🍲'];

@Component({
  selector: 'app-recipe-list',
  imports: [RouterLink],
  template: `
    <h1>Your recipes</h1>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else if (recipes().length === 0 && !error()) {
      <div class="card empty">
        <div class="empty-art" aria-hidden="true">🥕</div>
        <h2>No recipes yet</h2>
        <p class="muted">Use <strong>New Recipe</strong> above to write one or import one from a link.</p>
      </div>
    } @else {
      <ul class="grid">
        @for (r of recipes(); track r.id; let i = $index) {
          <li>
            <a class="card recipe-card" [routerLink]="['/recipes', r.id]">
              @if (r.image) {
                <img class="thumb" [src]="r.image" alt="" loading="lazy" referrerpolicy="no-referrer" />
              } @else {
                <div class="thumb placeholder" aria-hidden="true">{{ emoji(i) }}</div>
              }
              <h3>{{ r.title }}</h3>
              <p class="chips">
                <span class="chip">{{ r.ingredients.length }} {{ r.ingredients.length === 1 ? 'ingredient' : 'ingredients' }}</span>
                <span class="chip">{{ r.steps.length }} {{ r.steps.length === 1 ? 'step' : 'steps' }}</span>
              </p>
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

  readonly recipes = signal<Recipe[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  readonly host = hostOf;

  /** Recipes without a photo get a friendly emoji instead, varied by position. */
  emoji(index: number): string {
    return PLACEHOLDER_EMOJI[index % PLACEHOLDER_EMOJI.length];
  }

  async ngOnInit(): Promise<void> {
    try {
      this.recipes.set(await firstValueFrom(this.service.list()));
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
}
