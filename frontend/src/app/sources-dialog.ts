import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SOURCE_ICONS, Source, SourceIcon } from './models';
import { errorMessage } from './recipe.service';
import { SourceService, sourceIconUrl } from './source.service';

/**
 * Sources: the cook's own labels for where recipes come from, each with an icon. Opened
 * from the account menu to see, add, change and delete them, or from the editor straight
 * to "New source" (openNew), which hands back the source it made.
 */
@Component({
  selector: 'app-sources-dialog',
  imports: [FormsModule],
  template: `
    <dialog #dialog class="dialog sources-dialog" aria-labelledby="sources-title" (close)="finish()">
      @if (form(); as f) {
        <h2 id="sources-title">{{ f.id ? 'Edit source' : 'New source' }}</h2>
        <form (ngSubmit)="save()">
          <label class="field">
            <span>Name</span>
            <input #nameInput type="text" name="name" maxlength="60" placeholder="A cookbook, a website, a person" [(ngModel)]="name" />
          </label>
          <fieldset class="icon-picker">
            <legend>Icon</legend>
            <div class="icon-choices">
              @for (icon of icons; track icon.id) {
                <label class="icon-choice" [class.selected]="chosenIcon() === icon.id" [title]="icon.label">
                  <input
                    type="radio"
                    name="icon"
                    class="visually-hidden"
                    [value]="icon.id"
                    [checked]="chosenIcon() === icon.id"
                    (change)="chosenIcon.set(icon.id)"
                  />
                  <span class="tag-icon" [style.--tag-icon]="iconUrl(icon.id)" aria-hidden="true"></span>
                  <span class="visually-hidden">{{ icon.label }}</span>
                </label>
              }
            </div>
          </fieldset>
          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }
          <div class="actions">
            @if (f.id) {
              <button type="button" class="btn danger push-left" (click)="remove(f)" [disabled]="busy()">Delete</button>
            }
            <button type="button" class="btn" (click)="back()" [disabled]="busy()">Cancel</button>
            <button type="submit" class="btn primary" [disabled]="busy() || !name.trim()">Save</button>
          </div>
        </form>
      } @else {
        <h2 id="sources-title">Sources</h2>
        <p class="muted">
          Label recipes with where they come from, such as a cookbook, a website or a person. The icon shows on recipe
          cards, and the recipe list can show just one source's recipes.
        </p>
        @if (service.sources().length === 0) {
          <p class="muted">No sources yet.</p>
        } @else {
          <ul class="source-rows">
            @for (s of service.sources(); track s.id) {
              <li>
                <span class="tag-pill source-pill" [style.--tag-icon]="iconUrl(s.icon)">
                  <span class="tag-icon" aria-hidden="true"></span>{{ s.name }}
                </span>
                <button type="button" class="btn small" (click)="edit(s)" [attr.aria-label]="'Edit ' + s.name">Edit</button>
              </li>
            }
          </ul>
        }
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        <div class="actions">
          <button type="button" class="btn push-left" (click)="edit(null)">+ New source</button>
          <button type="button" class="btn primary" (click)="close()">Done</button>
        </div>
      }
    </dialog>
  `,
})
export class SourcesDialog {
  protected readonly service = inject(SourceService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  readonly icons = SOURCE_ICONS;
  readonly iconUrl = sourceIconUrl;

  /** The source being edited ({} for a new one), or null for the list. */
  readonly form = signal<{ id?: string } | null>(null);
  readonly chosenIcon = signal<SourceIcon>('book');
  readonly busy = signal(false);
  readonly error = signal('');
  name = '';

  /** Opened straight to "New source": Cancel closes rather than showing the list. */
  private newOnly = false;
  private resolveNew?: (source: Source | undefined) => void;

  /** The list of sources. */
  open(): void {
    this.newOnly = false;
    this.form.set(null);
    this.error.set('');
    this.dialog().nativeElement.showModal();
    this.service.load().catch((e) => this.error.set(errorMessage(e)));
  }

  /** Just the "New source" form; resolves with the new source, or undefined if cancelled. */
  openNew(): Promise<Source | undefined> {
    this.newOnly = true;
    this.edit(null);
    this.dialog().nativeElement.showModal();
    return new Promise((resolve) => (this.resolveNew = resolve));
  }

  edit(source: Source | null): void {
    this.error.set('');
    this.name = source?.name ?? '';
    this.chosenIcon.set(source?.icon ?? 'book');
    this.form.set(source ? { id: source.id } : {});
    setTimeout(() => this.nameInput()?.nativeElement.focus());
  }

  /** Cancel: back to the list, or closed when opened just to add one. */
  back(): void {
    if (this.newOnly) this.close();
    else {
      this.error.set('');
      this.form.set(null);
    }
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  /** However the dialog closed (Escape included), anyone waiting on openNew gets an answer. */
  finish(created?: Source): void {
    this.resolveNew?.(created);
    this.resolveNew = undefined;
  }

  async save(): Promise<void> {
    const f = this.form();
    const name = this.name.trim();
    if (!f || !name || this.busy()) return;
    this.error.set('');
    this.busy.set(true);
    try {
      const input = { name, icon: this.chosenIcon() };
      const saved = f.id ? await this.service.update(f.id, input) : await this.service.create(input);
      if (this.newOnly) {
        this.finish(saved);
        this.close();
      } else {
        this.form.set(null);
      }
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  async remove(f: { id?: string }): Promise<void> {
    const source = f.id ? this.service.byId().get(f.id) : undefined;
    if (!source || !confirm(`Delete the source "${source.name}"? Its recipes stay; they just lose this label.`)) return;
    this.busy.set(true);
    try {
      await this.service.remove(source.id);
      this.form.set(null);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
