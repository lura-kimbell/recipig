import { Component, OnInit, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { RECIPE_TAGS, Recipe, RecipeTag, Step } from './models';
import { shrinkPhoto } from './image-resize';
import { RecipeService, errorMessage, isUploadedImage, newId } from './recipe.service';
import { SourceService } from './source.service';
import { SourcesDialog } from './sources-dialog';

/** Long edge of an uploaded recipe photo: sharp across the recipe page, a few hundred KB. */
const PHOTO_EDGE = 1600;

const blank = (): Recipe => ({
  id: '',
  title: '',
  ingredients: [],
  steps: [],
  createdAt: '',
  updatedAt: '',
});

/**
 * The recipe form. It edits an existing recipe at /recipes/:id/edit and, with
 * route data `{ mode: 'create' }`, starts empty at /recipes/new.
 */
@Component({
  selector: 'app-recipe-edit',
  imports: [FormsModule, RouterLink, SourcesDialog],
  template: `
    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else if (loadError()) {
      <p class="error" role="alert">{{ loadError() }}</p>
      <a routerLink="/">← Back to recipes</a>
    } @else {
      <a class="back" [routerLink]="cancelLink()">← Cancel</a>
      <h1>{{ isNew() ? 'New recipe' : 'Edit recipe' }}</h1>
      @if (fromPhotos()) {
        <p class="notice" role="status">Read from your photos. Check it against the book, pick the book as its Source, then save.</p>
      }

      <datalist id="section-options">
        @for (name of sectionOptions(); track name) {
          <option [value]="name"></option>
        }
      </datalist>

      <section class="card stack">
        <label class="field">
          <span>Title</span>
          <input type="text" [(ngModel)]="draft.title" />
        </label>
        <div class="field">
          <label for="recipe-source">Source <span class="muted small">(a cookbook, website or person)</span></label>
          <div class="row source-row">
            <select id="recipe-source" name="source" class="grow" [(ngModel)]="draft.sourceId">
              <option [ngValue]="undefined">None</option>
              @for (s of sources.sources(); track s.id) {
                <option [ngValue]="s.id">{{ s.name }}</option>
              }
            </select>
            <button type="button" class="btn small" (click)="newSource()">+ New source</button>
          </div>
        </div>
        <label class="field">
          <span>Link <span class="muted small">(the page it came from)</span></span>
          <input type="url" placeholder="https://example.com/best-pancakes" [(ngModel)]="draft.sourceUrl" />
        </label>
        <div class="field" role="group" aria-labelledby="photo-label">
          <span id="photo-label">Photo</span>
          <div class="row photo-actions">
            <input #photoInput type="file" accept="image/*" class="visually-hidden" tabindex="-1" (change)="uploadPhoto($event)" />
            <button type="button" class="btn small" (click)="photoInput.click()" [disabled]="uploading()">
              {{ uploading() ? 'Uploading…' : draft.image ? 'Change photo' : 'Upload photo' }}
            </button>
            @if (draft.image && !uploading()) {
              <button type="button" class="btn small ghost" (click)="draft.image = undefined">Remove photo</button>
            }
          </div>
          @if (uploadError()) {
            <p class="error" role="alert">{{ uploadError() }}</p>
          }
        </div>
        @if (!isUploaded()) {
          <label class="field">
            <span>Or an image link</span>
            <input type="url" placeholder="https://example.com/photo.jpg" [(ngModel)]="draft.image" />
          </label>
        }
        @if (imagePreview(); as src) {
          <img class="hero edit-preview" [src]="src" alt="Preview of the recipe image" referrerpolicy="no-referrer" />
        }
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
        <label class="field">
          <span>Notes <span class="muted small">(optional)</span></span>
          <textarea rows="3" placeholder="Tweaks you tried, or ideas for next time" [(ngModel)]="draft.notes"></textarea>
        </label>
        <div class="field" role="group" aria-labelledby="tags-label">
          <span id="tags-label">Main ingredient</span>
          <div class="tag-list">
            @for (tag of allTags; track tag) {
              <button
                type="button"
                class="tag-pill"
                [attr.data-tag]="tag"
                [attr.aria-pressed]="hasTag(tag)"
                (click)="toggleTag(tag)"
              >
                <span class="tag-icon" aria-hidden="true"></span>{{ tag }}
              </button>
            }
          </div>
        </div>
      </section>

      <section class="card stack">
        <h2>Ingredients</h2>
        <p class="muted small">
          Optionally give items a section (like "Brine" or "Sauce"); items with the same section are grouped together.
        </p>
        @for (ing of draft.ingredients; track ing.id; let i = $index) {
          <div class="row item-row">
            <input
              class="section-input"
              type="text"
              list="section-options"
              placeholder="Section"
              [(ngModel)]="ing.section"
              (change)="refreshSectionOptions()"
              [attr.aria-label]="'Section for ingredient ' + (i + 1)"
            />
            <input
              class="grow"
              type="text"
              placeholder="e.g. 2 large eggs"
              [(ngModel)]="ing.text"
              [attr.aria-label]="'Ingredient ' + (i + 1)"
            />
            <button
              type="button"
              class="btn ghost small"
              (click)="moveIngredient(i, -1)"
              [disabled]="i === 0"
              [attr.aria-label]="'Move ingredient ' + (i + 1) + ' up'"
            >
              ▲
            </button>
            <button
              type="button"
              class="btn ghost small"
              (click)="moveIngredient(i, 1)"
              [disabled]="i === draft.ingredients.length - 1"
              [attr.aria-label]="'Move ingredient ' + (i + 1) + ' down'"
            >
              ▼
            </button>
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
            <div class="row item-row">
              <strong>Step {{ i + 1 }}</strong>
              <input
                class="section-input grow"
                type="text"
                list="section-options"
                placeholder="Section"
                [(ngModel)]="step.section"
                (change)="refreshSectionOptions()"
                [attr.aria-label]="'Section for step ' + (i + 1)"
              />
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
              <button type="button" class="btn small danger" (click)="removeStep(step.id)">Remove</button>
            </div>
            <textarea rows="3" [(ngModel)]="step.text" [attr.aria-label]="'Step ' + (i + 1)"></textarea>
            @if (draft.ingredients.length > 0) {
              <details>
                <summary>Ingredients shown with this step ({{ step.ingredientIds.length }})</summary>
                @for (ing of draft.ingredients; track ing.id) {
                  <label class="check">
                    <input type="checkbox" [checked]="step.ingredientIds.includes(ing.id)" (change)="toggleLink(step, ing.id)" />
                    <span class="check-text">{{ ing.text || '(blank ingredient)' }}</span>
                    @if (ing.section?.trim(); as sectionName) {
                      <span class="section-tag">{{ sectionName }}</span>
                    }
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
          {{ saving() ? 'Saving…' : isNew() ? 'Create recipe' : 'Save changes' }}
        </button>
        <a class="btn" [routerLink]="cancelLink()">Cancel</a>
      </div>
    }
    <app-sources-dialog />
  `,
})
export class RecipeEdit implements OnInit {
  private readonly service = inject(RecipeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly sources = inject(SourceService);
  private readonly sourcesDialog = viewChild.required(SourcesDialog);

  /** A working copy; nothing is saved until the user presses Save. */
  draft: Recipe = blank();

  readonly isNew = signal(false);
  /** The form was filled in from photos of a cookbook (see PhotoImportDialog). */
  readonly fromPhotos = signal(false);
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly saving = signal(false);
  readonly saveError = signal('');
  readonly uploading = signal(false);
  readonly uploadError = signal('');
  /** Where Cancel goes: the recipe being edited, or the list when creating. */
  readonly cancelLink = signal<string[]>(['/']);
  /** Section names already used in this recipe, offered as suggestions. */
  readonly sectionOptions = signal<string[]>([]);

  readonly allTags = RECIPE_TAGS;

  async ngOnInit(): Promise<void> {
    // The source picker fills in when they arrive; the form doesn't wait for them.
    this.sources.load().catch((e) => this.saveError.set(errorMessage(e)));

    if (this.route.snapshot.data['mode'] === 'create') {
      this.isNew.set(true);
      // A recipe read from photos arrives in the navigation state (kept by the browser on reload).
      const fromPhotos = history.state?.draft as Partial<Recipe> | undefined;
      if (fromPhotos?.ingredients && fromPhotos.steps) {
        this.draft = { ...blank(), ...structuredClone(fromPhotos) };
        this.fromPhotos.set(true);
        this.refreshSectionOptions();
      } else {
        this.draft = blank();
        this.addIngredient();
        this.addStep();
      }
      this.loading.set(false);
      return;
    }

    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.loadError.set('Recipe not found.');
      this.loading.set(false);
      return;
    }
    try {
      this.draft = structuredClone(await firstValueFrom(this.service.get(id)));
      this.cancelLink.set(['/recipes', this.draft.id]);
      this.refreshSectionOptions();
    } catch (e) {
      this.loadError.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  /** Make a source in the dialog and pick it for this recipe. */
  async newSource(): Promise<void> {
    const created = await this.sourcesDialog().openNew();
    if (created) this.draft.sourceId = created.id;
  }

  refreshSectionOptions(): void {
    const names = [...this.draft.ingredients, ...this.draft.steps]
      .map((item) => item.section?.trim())
      .filter((name): name is string => !!name);
    this.sectionOptions.set([...new Set(names)]);
  }

  /** New items join the section of the one before them, which is usually what you want. */
  addIngredient(): void {
    const section = this.draft.ingredients.at(-1)?.section;
    this.draft.ingredients.push({ id: newId(), text: '', checked: false, section });
  }

  removeIngredient(id: string): void {
    this.draft.ingredients = this.draft.ingredients.filter((i) => i.id !== id);
    for (const step of this.draft.steps) step.ingredientIds = step.ingredientIds.filter((x) => x !== id);
  }

  addStep(): void {
    const section = this.draft.steps.at(-1)?.section;
    this.draft.steps.push({ id: newId(), text: '', ingredientIds: [], section });
  }

  removeStep(id: string): void {
    this.draft.steps = this.draft.steps.filter((s) => s.id !== id);
  }

  moveIngredient(index: number, delta: number): void {
    const target = index + delta;
    const list = this.draft.ingredients;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
  }

  /** The photo to preview: an uploaded one, or a typed link that looks like a web address. */
  imagePreview(): string {
    const value = this.draft.image?.trim() ?? '';
    return /^https?:\/\//i.test(value) || isUploadedImage(value) ? value : '';
  }

  /** The photo was uploaded from this device, so there's no link to show or edit. */
  isUploaded(): boolean {
    return isUploadedImage(this.draft.image);
  }

  /** Shrink the chosen photo on the device, upload it, and make it the recipe's photo (saved with the recipe). */
  async uploadPhoto(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // so choosing the same photo again still fires
    if (!file) return;
    this.uploadError.set('');
    this.uploading.set(true);
    try {
      let photo: Blob;
      try {
        photo = await shrinkPhoto(file, PHOTO_EDGE);
      } catch {
        this.uploadError.set(`Couldn't open ${file.name}. Try a JPEG or PNG photo.`);
        return;
      }
      this.draft.image = await this.service.uploadImage(photo);
    } catch (e) {
      this.uploadError.set(errorMessage(e));
    } finally {
      this.uploading.set(false);
    }
  }

  moveStep(index: number, delta: number): void {
    const target = index + delta;
    const steps = this.draft.steps;
    if (target < 0 || target >= steps.length) return;
    [steps[index], steps[target]] = [steps[target], steps[index]];
  }

  hasTag(tag: RecipeTag): boolean {
    return this.draft.tags?.includes(tag) ?? false;
  }

  /** Tags are kept in the standard order, whichever order they were clicked in. */
  toggleTag(tag: RecipeTag): void {
    const current = this.draft.tags ?? [];
    const next = current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag];
    this.draft.tags = RECIPE_TAGS.filter((t) => next.includes(t));
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
      const cleaned = this.cleaned();
      const saved = await firstValueFrom(this.isNew() ? this.service.create(cleaned) : this.service.save(cleaned));
      await this.router.navigate(['/recipes', saved.id]);
    } catch (e) {
      this.saveError.set(errorMessage(e));
    } finally {
      this.saving.set(false);
    }
  }

  /** Trim text, drop blank items and empty sections, and forget links to ingredients that were removed. */
  private cleaned(): Recipe {
    const ingredients = this.draft.ingredients
      .filter((i) => i.text.trim())
      .map((i) => ({ ...i, text: i.text.trim(), section: i.section?.trim() || undefined }));
    const known = new Set(ingredients.map((i) => i.id));
    const steps = this.draft.steps
      .filter((s) => s.text.trim())
      .map((s) => ({
        ...s,
        text: s.text.trim(),
        section: s.section?.trim() || undefined,
        ingredientIds: s.ingredientIds.filter((id) => known.has(id)),
      }));
    return {
      ...this.draft,
      title: this.draft.title.trim(),
      sourceUrl: this.draft.sourceUrl?.trim() || undefined,
      // A source deleted since this page opened is simply dropped.
      sourceId: this.draft.sourceId && this.sources.byId().has(this.draft.sourceId) ? this.draft.sourceId : undefined,
      image: this.draft.image?.trim() || undefined,
      notes: this.draft.notes?.trim() || undefined,
      ingredients,
      steps,
    };
  }
}
