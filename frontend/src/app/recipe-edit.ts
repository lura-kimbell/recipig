import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Recipe, Step } from './models';
import { RecipeService, errorMessage, newId } from './recipe.service';

const blank = (): Recipe => ({
  id: '',
  title: '',
  ingredients: [],
  steps: [],
  createdAt: '',
  updatedAt: '',
});

@Component({
  selector: 'app-recipe-edit',
  imports: [FormsModule, RouterLink],
  template: `
    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else if (loadError()) {
      <p class="error" role="alert">{{ loadError() }}</p>
      <a routerLink="/">← Back to recipes</a>
    } @else {
      <a class="back" [routerLink]="['/recipes', draft.id]">← Cancel</a>
      <h1>Edit recipe</h1>

      <section class="card stack">
        <label class="field">
          <span>Title</span>
          <input type="text" [(ngModel)]="draft.title" />
        </label>
        <div class="two-col">
          <label class="field">
            <span>Servings</span>
            <input type="text" [(ngModel)]="draft.servings" />
          </label>
          <label class="field">
            <span>Prep time</span>
            <input type="text" [(ngModel)]="draft.prepTime" />
          </label>
          <label class="field">
            <span>Cook time</span>
            <input type="text" [(ngModel)]="draft.cookTime" />
          </label>
          <label class="field">
            <span>Total time</span>
            <input type="text" [(ngModel)]="draft.totalTime" />
          </label>
        </div>
      </section>

      <section class="card stack">
        <h2>Ingredients</h2>
        @for (ing of draft.ingredients; track ing.id; let i = $index) {
          <div class="row">
            <input
              class="grow"
              type="text"
              [(ngModel)]="ing.text"
              [attr.aria-label]="'Ingredient ' + (i + 1)"
            />
            <button
              type="button"
              class="btn ghost small"
              (click)="removeIngredient(ing.id)"
              [attr.aria-label]="'Remove ingredient ' + (i + 1)"
            >
              ✕
            </button>
          </div>
        }
        <div>
          <button type="button" class="btn small" (click)="addIngredient()">+ Add ingredient</button>
        </div>
      </section>

      <section class="card stack">
        <h2>Steps</h2>
        @for (step of draft.steps; track step.id; let i = $index) {
          <div class="edit-step">
            <div class="row">
              <strong class="grow">Step {{ i + 1 }}</strong>
              <button
                type="button"
                class="btn ghost small"
                (click)="moveStep(i, -1)"
                [disabled]="i === 0"
                aria-label="Move step up"
              >
                ▲
              </button>
              <button
                type="button"
                class="btn ghost small"
                (click)="moveStep(i, 1)"
                [disabled]="i === draft.steps.length - 1"
                aria-label="Move step down"
              >
                ▼
              </button>
              <button type="button" class="btn ghost small" (click)="removeStep(step.id)">Remove</button>
            </div>
            <textarea rows="3" [(ngModel)]="step.text" [attr.aria-label]="'Step ' + (i + 1)"></textarea>
            @if (draft.ingredients.length > 0) {
              <details>
                <summary>Ingredients shown with this step ({{ step.ingredientIds.length }})</summary>
                @for (ing of draft.ingredients; track ing.id) {
                  <label class="check">
                    <input type="checkbox" [checked]="step.ingredientIds.includes(ing.id)" (change)="toggleLink(step, ing.id)" />
                    <span>{{ ing.text || '(blank ingredient)' }}</span>
                  </label>
                }
              </details>
            }
          </div>
        }
        <div>
          <button type="button" class="btn small" (click)="addStep()">+ Add step</button>
        </div>
      </section>

      @if (saveError()) {
        <p class="error" role="alert">{{ saveError() }}</p>
      }
      <div class="row">
        <button type="button" class="btn primary" (click)="save()" [disabled]="saving()">
          {{ saving() ? 'Saving…' : 'Save changes' }}
        </button>
        <a class="btn" [routerLink]="['/recipes', draft.id]">Cancel</a>
      </div>
    }
  `,
})
export class RecipeEdit implements OnInit {
  private readonly service = inject(RecipeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /** A working copy; nothing is saved until the user presses Save. */
  draft: Recipe = blank();

  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly saving = signal(false);
  readonly saveError = signal('');

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.loadError.set('Recipe not found.');
      this.loading.set(false);
      return;
    }
    try {
      this.draft = structuredClone(await firstValueFrom(this.service.get(id)));
    } catch (e) {
      this.loadError.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  addIngredient(): void {
    this.draft.ingredients.push({ id: newId(), text: '', checked: false });
  }

  removeIngredient(id: string): void {
    this.draft.ingredients = this.draft.ingredients.filter((i) => i.id !== id);
    for (const step of this.draft.steps) step.ingredientIds = step.ingredientIds.filter((x) => x !== id);
  }

  addStep(): void {
    this.draft.steps.push({ id: newId(), text: '', ingredientIds: [] });
  }

  removeStep(id: string): void {
    this.draft.steps = this.draft.steps.filter((s) => s.id !== id);
  }

  moveStep(index: number, delta: number): void {
    const target = index + delta;
    const steps = this.draft.steps;
    if (target < 0 || target >= steps.length) return;
    [steps[index], steps[target]] = [steps[target], steps[index]];
  }

  toggleLink(step: Step, ingredientId: string): void {
    step.ingredientIds = step.ingredientIds.includes(ingredientId)
      ? step.ingredientIds.filter((x) => x !== ingredientId)
      : [...step.ingredientIds, ingredientId];
  }

  async save(): Promise<void> {
    this.saveError.set('');
    if (!this.draft.title.trim()) {
      this.saveError.set('Please give the recipe a title.');
      return;
    }
    this.saving.set(true);
    try {
      const saved = await firstValueFrom(this.service.save(this.cleaned()));
      await this.router.navigate(['/recipes', saved.id]);
    } catch (e) {
      this.saveError.set(errorMessage(e));
    } finally {
      this.saving.set(false);
    }
  }

  /** Trim text, drop blank items and forget links to ingredients that were removed. */
  private cleaned(): Recipe {
    const ingredients = this.draft.ingredients
      .filter((i) => i.text.trim())
      .map((i) => ({ ...i, text: i.text.trim() }));
    const known = new Set(ingredients.map((i) => i.id));
    const steps = this.draft.steps
      .filter((s) => s.text.trim())
      .map((s) => ({ ...s, text: s.text.trim(), ingredientIds: s.ingredientIds.filter((id) => known.has(id)) }));
    return { ...this.draft, title: this.draft.title.trim(), ingredients, steps };
  }
}
