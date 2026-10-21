import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { RECIPE_TAGS, Recipe, RecipeTag } from './models';
import { RecipeService, errorMessage } from './recipe.service';

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
      <div class="tag-filter" role="group" aria-labelledby="tag-filter-label">
        <span class="tag-filter-label" id="tag-filter-label">Show</span>
        @for (tag of allTags; track tag) {
          <button
            type="button"
            class="tag-pill"
            [attr.data-tag]="tag"
            [attr.aria-pressed]="isSelected(tag)"
            (click)="toggleTag(tag)"
          >
            <span class="tag-icon" aria-hidden="true"></span>{{ tag }}
            <span class="tag-count">{{ tagCounts()[tag] }}</span>
          </button>
        }
        @if (selected().length > 0) {
          <button type="button" class="link-btn" (click)="clearTags()">Show all</button>
        }
      </div>

      @if (filtered().length === 0) {
        <p class="muted">No recipes with {{ selected().length === 1 ? 'that tag' : 'those tags' }} yet.</p>
      }
      <ul class="grid">
        @for (r of filtered(); track r.id; let i = $index) {
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
              @if (r.tags?.length) {
                <ul class="tag-list card-tags" aria-label="Tags">
                  @for (tag of r.tags; track tag) {
                    <li class="tag-pill icon-only" [attr.data-tag]="tag" [title]="tag">
                      <span class="tag-icon" aria-hidden="true"></span><span class="visually-hidden">{{ tag }}</span>
                    </li>
                  }
                </ul>
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
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly recipes = signal<Recipe[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  readonly allTags = RECIPE_TAGS;
  /** Tags picked in the filter; kept in the URL (?tag=Chicken&tag=Fish) so Back returns to the same view. */
  readonly selected = signal<RecipeTag[]>([]);

  /** With tags picked, recipes that have any of them; otherwise everything. */
  readonly filtered = computed(() => {
    const picked = this.selected();
    if (picked.length === 0) return this.recipes();
    return this.recipes().filter((r) => r.tags?.some((t) => picked.includes(t)));
  });

  readonly tagCounts = computed(() => {
    const counts = Object.fromEntries(RECIPE_TAGS.map((t) => [t, 0])) as Record<RecipeTag, number>;
    for (const r of this.recipes()) for (const t of r.tags ?? []) counts[t]++;
    return counts;
  });

  /** Recipes without a photo get a friendly emoji instead, varied by position. */
  emoji(index: number): string {
    return PLACEHOLDER_EMOJI[index % PLACEHOLDER_EMOJI.length];
  }

  isSelected(tag: RecipeTag): boolean {
    return this.selected().includes(tag);
  }

  toggleTag(tag: RecipeTag): void {
    const next = this.isSelected(tag) ? this.selected().filter((t) => t !== tag) : [...this.selected(), tag];
    this.setSelected(RECIPE_TAGS.filter((t) => next.includes(t)));
  }

  clearTags(): void {
    this.setSelected([]);
  }

  private setSelected(tags: RecipeTag[]): void {
    this.selected.set(tags);
    void this.router.navigate([], { relativeTo: this.route, queryParams: { tag: tags }, replaceUrl: true });
  }

  async ngOnInit(): Promise<void> {
    const fromUrl = this.route.snapshot.queryParamMap.getAll('tag');
    this.selected.set(RECIPE_TAGS.filter((t) => fromUrl.includes(t)));
    try {
      this.recipes.set(await firstValueFrom(this.service.list()));
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
}
