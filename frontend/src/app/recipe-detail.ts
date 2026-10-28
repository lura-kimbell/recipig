import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Ingredient, Recipe, Step, groupBySection } from './models';
import { RecipeService, errorMessage, hostOf } from './recipe.service';
import { NUTRIENT_KEYS, estimateNutrition, scaleNutrients, servingCount } from './nutrition';
import { FOODS } from './nutrition-data';
import { scaleIngredientText } from './scale';

@Component({
  selector: 'app-recipe-detail',
  imports: [RouterLink],
  template: `
    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
      <a routerLink="/">← Back to recipes</a>
    } @else if (recipe(); as r) {
      <a routerLink="/" class="back">← All recipes</a>

      <header class="recipe-head">
        <h1 class="recipe-title">{{ r.title }}</h1>
        <div class="actions">
          <a class="btn" [routerLink]="['/recipes', r.id, 'edit']">Edit</a>
          <button type="button" class="btn danger" (click)="remove(r)">Delete</button>
        </div>
      </header>

      @if (r.image) {
        <img class="hero" [src]="r.image" alt="" referrerpolicy="no-referrer" />
      }

      <ul class="meta">
        @if (r.servings) {
          <li>Serves: {{ servingsText() }}</li>
        }
        @if (r.prepTime) {
          <li>Prep: {{ r.prepTime }}</li>
        }
        @if (r.cookTime) {
          <li>Cook: {{ r.cookTime }}</li>
        }
        @if (r.totalTime) {
          <li>Total: {{ r.totalTime }}</li>
        }
        @for (tag of r.tags ?? []; track tag) {
          <li class="tag-pill" [attr.data-tag]="tag"><span class="tag-icon" aria-hidden="true"></span>{{ tag }}</li>
        }
      </ul>

      @if (r.sourceUrl) {
        <p class="muted small">
          Source:
          <a [href]="r.sourceUrl" target="_blank" rel="noopener noreferrer">{{ host(r.sourceUrl) || r.sourceUrl }}</a>
        </p>
      }

      @if (r.notes?.trim(); as notes) {
        <section class="card notes-card" aria-labelledby="notes-title">
          <h2 id="notes-title">Notes</h2>
          <p class="recipe-notes">{{ notes }}</p>
        </section>
      }

      <div class="scale" role="group" aria-labelledby="scale-label">
        <span class="scale-label" id="scale-label">Batch size</span>
        <div class="scale-options">
          @for (m of multipliers; track m) {
            <button type="button" class="scale-btn" [attr.aria-pressed]="multiplier() === m" (click)="setMultiplier(m)">
              {{ m }}x
            </button>
          }
        </div>
        @if (multiplier() !== 1) {
          <span class="muted small">
            Ingredient amounts are {{ multiplier() < 1 ? 'halved' : 'multiplied by ' + multiplier() }}. Amounts written
            inside step text aren't changed.
          </span>
        }
      </div>

      @if (saveError()) {
        <p class="error" role="alert">Couldn't save your changes: {{ saveError() }}</p>
      }

      <section class="card">
        <div class="section-head">
          <h2>Ingredients</h2>
          <span class="muted small">{{ purchased() }} of {{ r.ingredients.length }} purchased</span>
        </div>
        @if (r.ingredients.length === 0) {
          <p class="muted">No ingredients yet.</p>
        }
        @for (group of ingredientGroups(); track $index) {
          @if (group.section) {
            <h3 class="group-title">{{ group.section }}</h3>
          }
          <ul class="plain">
            @for (ing of group.items; track ing.id) {
              <li>
                <label class="check">
                  <input type="checkbox" [checked]="ing.checked" (change)="toggleIngredient(ing.id)" />
                  <span [class.done]="ing.checked">{{ amount(ing) }}</span>
                </label>
              </li>
            }
          </ul>
        }
        @if (purchased() > 0) {
          <button type="button" class="btn small" (click)="clearChecks()">Clear checkmarks</button>
        }
      </section>

      <section class="card">
        <div class="section-head">
          <h2>Steps</h2>
          @if (linkedStepIds().length > 0) {
            <button type="button" class="btn small" (click)="toggleAll()">
              {{ allOpen() ? 'Collapse all' : 'Expand all' }} ingredients
            </button>
          }
        </div>
        @if (r.steps.length === 0) {
          <p class="muted">No steps yet.</p>
        }
        @for (group of stepGroups(); track $index) {
          @if (group.section) {
            <h3 class="group-title">{{ group.section }}</h3>
          }
          <ol class="steps" role="list" [attr.start]="stepNumber(group.items[0])">
            @for (step of group.items; track step.id) {
              <li [attr.data-step]="stepNumber(step)">
                <p>{{ step.text }}</p>
                @if (linked(step).length > 0) {
                  <button
                    type="button"
                    class="link-btn"
                    (click)="toggleStep(step.id)"
                    [attr.aria-expanded]="isOpen(step.id)"
                  >
                    {{ isOpen(step.id) ? '▾' : '▸' }} Ingredients for this step ({{ linked(step).length }})
                  </button>
                  @if (isOpen(step.id)) {
                    <ul class="step-ingredients">
                      @for (ing of linked(step); track ing.id) {
                        <li>{{ amount(ing) }}</li>
                      }
                    </ul>
                  }
                }
              </li>
            }
          </ol>
        }
      </section>

      <section class="card" aria-labelledby="nutrition-title">
        <div class="section-head">
          <h2 id="nutrition-title">Nutrition</h2>
          <span class="muted small">Estimate</span>
        </div>
        @if (nutrition().counted === 0) {
          <p class="muted">Add amounts to the ingredients (like "1 cup flour") to see a nutrition estimate.</p>
        } @else {
          <table class="nutrition">
            <thead>
              <tr>
                <th scope="col"><span class="visually-hidden">Nutrient</span></th>
                @if (perServing(); as serving) {
                  <th scope="col">Per serving</th>
                }
                <th scope="col">{{ multiplier() !== 1 ? 'Whole batch (' + multiplier() + 'x)' : 'Whole recipe' }}</th>
              </tr>
            </thead>
            <tbody>
              @for (row of nutrientRows; track row.key) {
                <tr [class.sub]="row.sub">
                  <th scope="row">{{ row.label }}</th>
                  @if (perServing(); as serving) {
                    <td>{{ show(serving[row.key], row.unit) }}</td>
                  }
                  <td>{{ show(batchNutrition()[row.key], row.unit) }}</td>
                </tr>
              }
            </tbody>
          </table>
          <p class="muted small">
            From typical USDA values for {{ nutrition().counted }} of {{ r.ingredients.length }} ingredients.
            @if (servingsInBatch(); as n) {
              Per serving is the batch divided into {{ n }}.
            }
          </p>
          @if (nutrition().skipped.length > 0) {
            <p class="muted small">Not counted: {{ skippedText() }}</p>
          }
        }
      </section>
    }
  `,
})
export class RecipeDetail implements OnInit {
  private readonly service = inject(RecipeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly recipe = signal<Recipe | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly saveError = signal('');
  /** Ids of steps whose ingredient list is expanded. */
  readonly open = signal<ReadonlySet<string>>(new Set());

  readonly host = hostOf;

  /** Batch sizes offered; the recipe as written is 1x. */
  readonly multipliers = [0.5, 1, 2, 3, 4] as const;
  readonly multiplier = signal<number>(1);

  /** Ingredient lines with their amounts multiplied. Only for display: the saved recipe is never changed. */
  private readonly scaledAmounts = computed(() => {
    const factor = this.multiplier();
    return new Map((this.recipe()?.ingredients ?? []).map((i) => [i.id, scaleIngredientText(i.text, factor)]));
  });
  readonly servingsText = computed(() => scaleIngredientText(this.recipe()?.servings ?? '', this.multiplier()));

  /** Nutrition of the recipe as written; the batch size only multiplies it. */
  readonly nutrition = computed(() => estimateNutrition((this.recipe()?.ingredients ?? []).map((i) => i.text), FOODS));
  readonly batchNutrition = computed(() => scaleNutrients(this.nutrition().total, this.multiplier()));
  readonly servingsInBatch = computed(() => {
    const servings = servingCount(this.recipe()?.servings);
    return servings ? servings * this.multiplier() : null;
  });
  /** Servings grow with the batch, so a serving stays the same size. */
  readonly perServing = computed(() => {
    const servings = servingCount(this.recipe()?.servings);
    return servings ? scaleNutrients(this.nutrition().total, 1 / servings) : null;
  });
  readonly skippedText = computed(() => this.nutrition().skipped.map((s) => s.text).join(', '));
  readonly nutrientRows: { key: (typeof NUTRIENT_KEYS)[number]; label: string; unit: 'kcal' | 'g' | 'mg'; sub?: boolean }[] = [
    { key: 'calories', label: 'Calories', unit: 'kcal' },
    { key: 'protein', label: 'Protein', unit: 'g' },
    { key: 'carbs', label: 'Carbohydrates', unit: 'g' },
    { key: 'fiber', label: 'Fiber', unit: 'g', sub: true },
    { key: 'sugar', label: 'Sugar', unit: 'g', sub: true },
    { key: 'fat', label: 'Fat', unit: 'g' },
    { key: 'sodium', label: 'Sodium', unit: 'mg' },
  ];

  /** "1,240 kcal", "8.5 g", "36 g", "410 mg". */
  show(value: number, unit: string): string {
    const rounded = unit === 'g' && value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
    return `${rounded.toLocaleString('en-US')} ${unit}`;
  }

  readonly ingredientGroups = computed(() => groupBySection(this.recipe()?.ingredients ?? []));
  readonly stepGroups = computed(() => groupBySection(this.recipe()?.steps ?? []));
  /** Steps are numbered through the whole recipe, not restarting in each section. */
  private readonly stepNumbers = computed(() => new Map((this.recipe()?.steps ?? []).map((s, i) => [s.id, i + 1])));
  readonly purchased = computed(() => this.recipe()?.ingredients.filter((i) => i.checked).length ?? 0);
  readonly linkedStepIds = computed(
    () => this.recipe()?.steps.filter((s) => s.ingredientIds.length > 0).map((s) => s.id) ?? [],
  );
  readonly allOpen = computed(() => {
    const ids = this.linkedStepIds();
    const open = this.open();
    return ids.length > 0 && ids.every((id) => open.has(id));
  });

  /** Saves run one after another so rapid checkbox clicks can't arrive out of order. */
  private saving: Promise<unknown> = Promise.resolve();

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error.set('Recipe not found.');
      this.loading.set(false);
      return;
    }
    try {
      this.recipe.set(await firstValueFrom(this.service.get(id)));
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  setMultiplier(value: number): void {
    this.multiplier.set(value);
  }

  /** An ingredient as it should read at the chosen batch size. */
  amount(ingredient: Ingredient): string {
    return this.scaledAmounts().get(ingredient.id) ?? ingredient.text;
  }

  stepNumber(step: Step): number {
    return this.stepNumbers().get(step.id) ?? 0;
  }

  linked(step: Step): Ingredient[] {
    return (this.recipe()?.ingredients ?? []).filter((i) => step.ingredientIds.includes(i.id));
  }

  isOpen(stepId: string): boolean {
    return this.open().has(stepId);
  }

  toggleStep(stepId: string): void {
    this.open.update((current) => {
      const next = new Set(current);
      if (!next.delete(stepId)) next.add(stepId);
      return next;
    });
  }

  toggleAll(): void {
    this.open.set(this.allOpen() ? new Set() : new Set(this.linkedStepIds()));
  }

  toggleIngredient(id: string): void {
    this.updateIngredients((i) => (i.id === id ? { ...i, checked: !i.checked } : i));
  }

  clearChecks(): void {
    this.updateIngredients((i) => ({ ...i, checked: false }));
  }

  async remove(recipe: Recipe): Promise<void> {
    if (!confirm(`Delete "${recipe.title}"? This can't be undone.`)) return;
    try {
      await firstValueFrom(this.service.remove(recipe.id));
      await this.router.navigate(['/']);
    } catch (e) {
      this.saveError.set(errorMessage(e));
    }
  }

  private updateIngredients(change: (i: Ingredient) => Ingredient): void {
    this.recipe.update((r) => (r ? { ...r, ingredients: r.ingredients.map(change) } : r));
    this.persist();
  }

  private persist(): void {
    this.saving = this.saving.then(async () => {
      const current = this.recipe();
      if (!current) return;
      try {
        await firstValueFrom(this.service.save(current));
        this.saveError.set('');
      } catch (e) {
        this.saveError.set(errorMessage(e));
      }
    });
  }
}
