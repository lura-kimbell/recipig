import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { errorMessage } from './recipe.service';
import { THEMES, ThemeId, ThemeService } from './theme.service';

/** The "Change theme" dialog. Picking a theme shows it straight away and saves it to the account. */
@Component({
  selector: 'app-theme-picker',
  template: `
    <dialog #dialog class="dialog" aria-labelledby="theme-title">
      <h2 id="theme-title">Change theme</h2>
      <div class="theme-options" role="radiogroup" aria-labelledby="theme-title">
        @for (t of themes; track t.id) {
          <label class="theme-option" [class.selected]="theme.current() === t.id">
            <input
              type="radio"
              name="theme"
              class="visually-hidden"
              [value]="t.id"
              [attr.aria-label]="t.name + ': ' + t.description"
              [checked]="theme.current() === t.id"
              (change)="choose(t.id)"
            />
            <div class="theme-preview" [attr.data-theme]="t.id" aria-hidden="true">
              <div class="mini-header"><span class="mini-brand"></span><span class="mini-button"></span></div>
              <div class="mini-body">
                <div class="mini-card">
                  <span class="mini-thumb"></span><span class="mini-title">Pancakes</span><span class="mini-pill"></span>
                </div>
                <div class="mini-card">
                  <span class="mini-thumb"></span><span class="mini-title">Lentil soup</span><span class="mini-pill"></span>
                </div>
              </div>
            </div>
            <span class="theme-name">{{ t.name }}</span>
            <span class="muted small">{{ t.description }}</span>
          </label>
        }
      </div>
      <label class="check theme-photos">
        <input type="checkbox" [checked]="theme.imagesHidden()" (change)="setImagesHidden($any($event.target).checked)" />
        <span>Hide recipe photos in {{ currentName() }}</span>
      </label>
      @if (error()) {
        <p class="error" role="alert">Couldn't save your theme: {{ error() }}</p>
      }
      <div class="actions">
        <button type="button" class="btn primary" (click)="close()">Done</button>
      </div>
    </dialog>
  `,
})
export class ThemePicker {
  protected readonly theme = inject(ThemeService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly themes = THEMES;
  readonly error = signal('');
  readonly currentName = computed(() => THEMES.find((t) => t.id === this.theme.current())!.name);

  open(): void {
    this.error.set('');
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  /** The photo setting belongs to the theme showing now; other themes keep their own. */
  async setImagesHidden(hidden: boolean): Promise<void> {
    this.error.set('');
    try {
      await this.theme.setImagesHidden(this.theme.current(), hidden);
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }

  async choose(id: ThemeId): Promise<void> {
    this.error.set('');
    try {
      await this.theme.choose(id);
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }
}
