import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Recipe } from './models';
import { RecipeService, errorMessage, hostOf } from './recipe.service';

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
      <p class="muted">Nothing saved yet. Use <strong>New Recipe</strong> above to write one or import one from a link.</p>
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

  readonly recipes = signal<Recipe[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

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
}
