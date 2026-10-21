import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { RecipeService, errorMessage } from './recipe.service';

/** The "New Recipe → From URL" dialog. A successful import opens the new recipe. */
@Component({
  selector: 'app-import-dialog',
  imports: [FormsModule],
  template: `
    <dialog #dialog class="dialog import-dialog" aria-labelledby="import-title" (cancel)="onCancel($event)">
      <h2 id="import-title">Import from URL</h2>
      <p class="muted">Paste a link to a recipe page. Recipig keeps just the ingredients and steps.</p>
      <form class="row" (ngSubmit)="importRecipe()">
        <input
          #urlInput
          type="url"
          name="url"
          class="grow"
          placeholder="https://example.com/best-pancakes"
          aria-label="Recipe link"
          [(ngModel)]="url"
          [disabled]="importing()"
        />
        <button type="submit" class="btn primary" [disabled]="importing() || !url.trim()">
          {{ importing() ? 'Importing…' : 'Import' }}
        </button>
      </form>
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      <div class="actions">
        <button type="button" class="btn" (click)="close()" [disabled]="importing()">Cancel</button>
      </div>
    </dialog>
  `,
})
export class ImportDialog {
  private readonly service = inject(RecipeService);
  private readonly router = inject(Router);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('urlInput');

  readonly importing = signal(false);
  readonly error = signal('');
  url = '';

  open(): void {
    this.url = '';
    this.error.set('');
    this.dialog().nativeElement.showModal();
    this.input().nativeElement.focus();
  }

  close(): void {
    if (!this.importing()) this.dialog().nativeElement.close();
  }

  /** Escape doesn't close the dialog while an import is running. */
  onCancel(event: Event): void {
    if (this.importing()) event.preventDefault();
  }

  async importRecipe(): Promise<void> {
    const url = this.url.trim();
    if (!url || this.importing()) return;
    this.error.set('');
    this.importing.set(true);
    try {
      const recipe = await firstValueFrom(this.service.importFromUrl(url));
      this.importing.set(false);
      this.close();
      await this.router.navigate(['/recipes', recipe.id]);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.importing.set(false);
    }
  }
}
