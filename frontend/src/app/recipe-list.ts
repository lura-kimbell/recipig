import { NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { RECIPE_TAGS, Recipe, RecipeTag } from './models';
import { RecipeService, errorMessage } from './recipe.service';
import { searchRecipes } from './search';

const PLACEHOLDER_EMOJI = ['🍳', '🥕', '🍰', '🍓', '🥐', '🍲'];

@Component({
  selector: 'app-recipe-list',
  imports: [RouterLink, NgTemplateOutlet],
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
      <div class="search" role="search">
        <span class="search-icon" aria-hidden="true"></span>
        <input
          type="search"
          placeholder="Search recipes and ingredients"
          aria-label="Search recipes and ingredients"
          [value]="query()"
          (input)="setQuery($any($event.target).value)"
        />
      </div>

      @if (filterTags().length > 0) {
      <div class="tag-filter" role="group" aria-labelledby="tag-filter-label">
        <span class="tag-filter-label" id="tag-filter-label">Show</span>
        @for (tag of filterTags(); track tag) {
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
      }

      @if (results(); as found) {
        @if (found.byName.length === 0 && found.byIngredient.length === 0) {
          <p class="muted">
            No recipes match “{{ query().trim() }}”{{ selected().length > 0 ? ' with the tags picked' : '' }}.
            <button type="button" class="link-btn" (click)="setQuery('')">Clear search</button>
          </p>
        }
        <!-- One list: name matches first, then ingredient matches; each card's label says which. -->
        <ul class="grid">
          @for (r of found.byName; track r.id; let i = $index) {
            <li>
              <ng-container *ngTemplateOutlet="card; context: { $implicit: r, index: i, match: 'Recipe' }" />
            </li>
          }
          @for (m of found.byIngredient; track m.recipe.id; let i = $index) {
            <li>
              <ng-container
                *ngTemplateOutlet="card; context: { $implicit: m.recipe, index: found.byName.length + i, match: 'Ingredient', lines: m.lines }"
              />
            </li>
          }
        </ul>
      } @else {
        @if (filtered().length === 0) {
          <p class="muted">No recipes with {{ selected().length === 1 ? 'that tag' : 'those tags' }} yet.</p>
        }
        <ul class="grid">
          @for (r of filtered(); track r.id; let i = $index) {
            <li>
              <ng-container *ngTemplateOutlet="card; context: { $implicit: r, index: i }" />
            </li>
          }
        </ul>
      }
    }

    <ng-template #card let-r let-i="index" let-match="match" let-lines="lines">
      <a class="card recipe-card" [routerLink]="['/recipes', r.id]">
        @if (r.image) {
          <img class="thumb" [src]="r.image" alt="" loading="lazy" referrerpolicy="no-referrer" />
        } @else {
          <div class="thumb placeholder" aria-hidden="true">{{ emoji(i) }}</div>
        }
        <h3>{{ r.title }}</h3>
        <p class="chips">
          @if (match) {
            <span class="chip match-chip" [class.by-ingredient]="match === 'Ingredient'">{{ match }} match</span>
          }
          <span class="chip">{{ r.ingredients.length }} {{ r.ingredients.length === 1 ? 'ingredient' : 'ingredients' }}</span>
          <span class="chip">{{ r.steps.length }} {{ r.steps.length === 1 ? 'step' : 'steps' }}</span>
        </p>
        @if (lines?.length) {
          <p class="match-lines small">Has: {{ lines.join(', ') }}</p>
        }
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
    </ng-template>
  `,
})
export class RecipeList implements OnInit {
  private readonly service = inject(RecipeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly recipes = signal<Recipe[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  /** Tags picked in the filter; kept in the URL (?tag=Chicken&tag=Fish) so Back returns to the same view. */
  readonly selected = signal<RecipeTag[]>([]);
  /** The search box; kept in the URL (?q=lime) like the tags. */
  readonly query = signal('');

  /** With tags picked, recipes that have any of them; otherwise everything. */
  readonly filtered = computed(() => {
    const picked = this.selected();
    if (picked.length === 0) return this.recipes();
    return this.recipes().filter((r) => r.tags?.some((t) => picked.includes(t)));
  });

  /** Name matches, then ingredient matches, within the tag filter; null when not searching. */
  readonly results = computed(() => searchRecipes(this.filtered(), this.query()));

  readonly tagCounts = computed(() => {
    const counts = Object.fromEntries(RECIPE_TAGS.map((t) => [t, 0])) as Record<RecipeTag, number>;
    for (const r of this.recipes()) for (const t of r.tags ?? []) counts[t]++;
    return counts;
  });

  /** Only tags some recipe has (plus any picked, so they can be unpicked); no "Pork 0". */
  readonly filterTags = computed(() => RECIPE_TAGS.filter((t) => this.tagCounts()[t] > 0 || this.isSelected(t)));

  /** Recipes without a photo get a friendly emoji instead, varied by position. */
  emoji(index: number): string {
    return PLACEHOLDER_EMOJI[index % PLACEHOLDER_EMOJI.length];
  }

  isSelected(tag: RecipeTag): boolean {
    return this.selected().includes(tag);
  }

  toggleTag(tag: RecipeTag): void {
    const next = this.isSelected(tag) ? this.selected().filter((t) => t !== tag) : [...this.selected(), tag];
    this.selected.set(RECIPE_TAGS.filter((t) => next.includes(t)));
    this.syncUrl();
  }

  clearTags(): void {
    this.selected.set([]);
    this.syncUrl();
  }

  setQuery(value: string): void {
    this.query.set(value);
    this.syncUrl();
  }

  private syncUrl(): void {
    const q = this.query().trim();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tag: this.selected(), q: q || null },
      replaceUrl: true,
    });
  }

  async ngOnInit(): Promise<void> {
    const params = this.route.snapshot.queryParamMap;
    const fromUrl = params.getAll('tag');
    this.selected.set(RECIPE_TAGS.filter((t) => fromUrl.includes(t)));
    this.query.set(params.get('q') ?? '');
    try {
      this.recipes.set(await firstValueFrom(this.service.list()));
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
}
