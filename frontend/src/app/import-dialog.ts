import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';
import { Recipe } from './models';
import { RecipeService, errorMessage } from './recipe.service';

/**
 * The "New Recipe → From URL" dialog. A successful import opens the new recipe. Some sites turn
 * the importer away (bot protection), so the dialog can also take the page source the cook copies
 * from their own browser; it switches to that by itself when a site blocks the link.
 */
@Component({
  selector: 'app-import-dialog',
  imports: [FormsModule],
  template: `
    <dialog #dialog class="dialog import-dialog" aria-labelledby="import-title" (cancel)="onCancel($event)">
      @if (mode() === 'url') {
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
      } @else {
        <h2 id="import-title">Paste the page</h2>
        @if (blocked()) {
          <p class="notice" role="status">That site doesn't let Recipig read its pages, but you can bring the page over yourself.</p>
        }
        <ol class="paste-steps">
          <li>Open the recipe in your browser.</li>
          <li>
            View its source: <kbd>Ctrl</kbd>+<kbd>U</kbd> in Chrome, Edge and Firefox (<kbd>⌥</kbd><kbd>⌘</kbd><kbd>U</kbd> on a
            Mac); in Safari, Develop → Show Page Source.
          </li>
          <li>Select all, copy, and paste it below.</li>
        </ol>
        <p class="muted small">On a phone, New Recipe → From Photos is easier: take screenshots of the recipe.</p>
        <form class="paste-form" (ngSubmit)="importPasted()">
          <label class="field">
            <span>Page source</span>
            <textarea
              #htmlInput
              name="html"
              class="paste-box"
              rows="6"
              spellcheck="false"
              placeholder="<!DOCTYPE html>…"
              [(ngModel)]="html"
              [disabled]="importing()"
            ></textarea>
          </label>
          <label class="field">
            <span>Link <span class="muted small">(optional; the page it came from)</span></span>
            <input type="url" name="pageUrl" placeholder="https://example.com/best-pancakes" [(ngModel)]="url" [disabled]="importing()" />
          </label>
          <div class="row">
            <button type="submit" class="btn primary" [disabled]="importing() || !html.trim()">
              {{ importing() ? 'Importing…' : 'Import' }}
            </button>
          </div>
        </form>
      }
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      <div class="actions">
        @if (mode() === 'url') {
          <button type="button" class="link-btn push-left" (click)="showPaste(false)" [disabled]="importing()">
            Site blocked? Paste the page
          </button>
        } @else {
          <button type="button" class="link-btn push-left" (click)="showUrl()" [disabled]="importing()">← Import from a link</button>
        }
        <button type="button" class="btn" (click)="close()" [disabled]="importing()">Cancel</button>
      </div>
    </dialog>
  `,
})
export class ImportDialog {
  private readonly service = inject(RecipeService);
  private readonly router = inject(Router);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly urlInput = viewChild<ElementRef<HTMLInputElement>>('urlInput');
  private readonly htmlInput = viewChild<ElementRef<HTMLTextAreaElement>>('htmlInput');

  readonly mode = signal<'url' | 'paste'>('url');
  /** The last link import was turned away by the site. */
  readonly blocked = signal(false);
  readonly importing = signal(false);
  readonly error = signal('');
  url = '';
  html = '';

  open(): void {
    this.url = '';
    this.html = '';
    this.error.set('');
    this.blocked.set(false);
    this.mode.set('url');
    this.dialog().nativeElement.showModal();
    setTimeout(() => this.urlInput()?.nativeElement.focus());
  }

  close(): void {
    if (!this.importing()) this.dialog().nativeElement.close();
  }

  /** Escape doesn't close the dialog while an import is running. */
  onCancel(event: Event): void {
    if (this.importing()) event.preventDefault();
  }

  showPaste(blocked: boolean): void {
    this.blocked.set(blocked);
    this.error.set('');
    this.mode.set('paste');
    setTimeout(() => this.htmlInput()?.nativeElement.focus());
  }

  showUrl(): void {
    this.error.set('');
    this.mode.set('url');
    setTimeout(() => this.urlInput()?.nativeElement.focus());
  }

  importRecipe(): void {
    const url = this.url.trim();
    if (url) void this.run(this.service.importFromUrl(url));
  }

  importPasted(): void {
    if (this.html.trim()) void this.run(this.service.importFromHtml(this.html, this.url.trim() || undefined));
  }

  private async run(request: Observable<Recipe>): Promise<void> {
    if (this.importing()) return;
    this.error.set('');
    this.importing.set(true);
    try {
      const recipe = await firstValueFrom(request);
      this.importing.set(false);
      this.close();
      await this.router.navigate(['/recipes', recipe.id]);
    } catch (e) {
      // A site that blocks the importer: offer the paste route straight away, keeping the link.
      if (this.mode() === 'url' && e instanceof HttpErrorResponse && e.error?.blocked === true) {
        this.importing.set(false);
        this.showPaste(true);
        return;
      }
      this.error.set(errorMessage(e));
    } finally {
      this.importing.set(false);
    }
  }
}
