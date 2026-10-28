import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PhotoUpload, RecipeService, errorMessage } from './recipe.service';

/** Photos per recipe; must match MAX_PHOTOS in backend/src/app.ts. */
const MAX_PHOTOS = 6;
/** Long edge sent for reading: sharp enough for small print, small enough to upload quickly. */
const MAX_EDGE = 2400;

interface Photo {
  id: number;
  name: string;
  /** Object URL of the resized photo, for the thumbnail. */
  preview: string;
  blob: Blob;
}

/**
 * The "New Recipe → From Photos" dialog. The cook takes or picks photos of a cookbook
 * recipe (several when it runs over pages), puts them in page order, and the server
 * reads them into a draft that opens in the editor for checking before it is saved.
 */
@Component({
  selector: 'app-photo-import-dialog',
  template: `
    <dialog #dialog class="dialog import-dialog" aria-labelledby="photo-import-title" (cancel)="onCancel($event)" (close)="reset()">
      <h2 id="photo-import-title">Import from photos</h2>
      <p class="muted">
        Photograph a recipe in a book. If it runs over more than one page, add a photo of each page, in order.
      </p>

      @if (photos().length > 0) {
        <ol class="photo-list">
          @for (photo of photos(); track photo.id; let i = $index; let first = $first; let last = $last) {
            <li class="photo-item">
              <img [src]="photo.preview" [alt]="'Page ' + (i + 1) + ': ' + photo.name" />
              <span class="photo-page">Page {{ i + 1 }}</span>
              <div class="photo-tools">
                <button type="button" class="btn small" (click)="move(i, -1)" [disabled]="first || reading()" [attr.aria-label]="'Move page ' + (i + 1) + ' earlier'">←</button>
                <button type="button" class="btn small" (click)="move(i, 1)" [disabled]="last || reading()" [attr.aria-label]="'Move page ' + (i + 1) + ' later'">→</button>
                <button type="button" class="btn small danger" (click)="remove(photo.id)" [disabled]="reading()" [attr.aria-label]="'Remove page ' + (i + 1)">✕</button>
              </div>
            </li>
          }
        </ol>
      }

      <div class="row photo-pickers">
        <input #camera type="file" accept="image/*" capture="environment" class="visually-hidden" tabindex="-1" (change)="add($event)" />
        <input #library type="file" accept="image/*" multiple class="visually-hidden" tabindex="-1" (change)="add($event)" />
        <button type="button" class="btn" (click)="camera.click()" [disabled]="full() || reading() || preparing()">Take photo</button>
        <button type="button" class="btn" (click)="library.click()" [disabled]="full() || reading() || preparing()">Choose photos</button>
        @if (preparing()) {
          <span class="muted small">Preparing photos…</span>
        } @else if (full()) {
          <span class="muted small">That's the most ({{ maxPhotos }}) for one recipe.</span>
        }
      </div>

      @if (reading()) {
        <p class="muted" role="status">Reading the recipe… this can take up to a minute.</p>
      }
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      <div class="actions">
        <button type="button" class="btn" (click)="close()" [disabled]="reading()">Cancel</button>
        <button type="button" class="btn primary" (click)="read()" [disabled]="photos().length === 0 || reading() || preparing()">
          {{ reading() ? 'Reading…' : 'Read recipe' }}
        </button>
      </div>
    </dialog>
  `,
})
export class PhotoImportDialog {
  private readonly service = inject(RecipeService);
  private readonly router = inject(Router);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly maxPhotos = MAX_PHOTOS;
  readonly photos = signal<Photo[]>([]);
  readonly preparing = signal(false);
  readonly reading = signal(false);
  readonly error = signal('');
  private nextId = 0;

  full(): boolean {
    return this.photos().length >= MAX_PHOTOS;
  }

  open(): void {
    this.reset();
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    if (!this.reading()) this.dialog().nativeElement.close();
  }

  /** Forget the photos (they are only ever kept in this dialog). */
  reset(): void {
    if (this.reading()) return;
    for (const p of this.photos()) URL.revokeObjectURL(p.preview);
    this.photos.set([]);
    this.error.set('');
  }

  /** Escape doesn't close the dialog while the recipe is being read. */
  onCancel(event: Event): void {
    if (this.reading()) event.preventDefault();
  }

  async add(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = ''; // so picking the same file again still fires
    if (files.length === 0) return;
    this.error.set('');
    const room = MAX_PHOTOS - this.photos().length;
    if (files.length > room) this.error.set(`Only ${MAX_PHOTOS} photos fit in one recipe, so the rest were left out.`);
    this.preparing.set(true);
    try {
      for (const file of files.slice(0, room)) {
        try {
          const blob = await shrink(file);
          this.photos.update((list) => [...list, { id: this.nextId++, name: file.name, preview: URL.createObjectURL(blob), blob }]);
        } catch {
          this.error.set(`Couldn't open ${file.name}. Try a JPEG or PNG photo.`);
        }
      }
    } finally {
      this.preparing.set(false);
    }
  }

  move(index: number, delta: number): void {
    this.photos.update((list) => {
      const next = [...list];
      [next[index], next[index + delta]] = [next[index + delta], next[index]];
      return next;
    });
  }

  remove(id: number): void {
    const photo = this.photos().find((p) => p.id === id);
    if (photo) URL.revokeObjectURL(photo.preview);
    this.photos.update((list) => list.filter((p) => p.id !== id));
  }

  async read(): Promise<void> {
    if (this.photos().length === 0 || this.reading()) return;
    this.error.set('');
    this.reading.set(true);
    try {
      const uploads: PhotoUpload[] = await Promise.all(
        this.photos().map(async (p) => ({ mediaType: 'image/jpeg' as const, data: await toBase64(p.blob) })),
      );
      const draft = await firstValueFrom(this.service.importFromPhotos(uploads));
      this.reading.set(false);
      this.close();
      await this.router.navigate(['/recipes/new'], { state: { draft } });
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.reading.set(false);
    }
  }
}

/** The photo as a JPEG no bigger than MAX_EDGE on its long side, the right way up. */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No canvas');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode'))), 'image/jpeg', 0.85),
    );
  } finally {
    bitmap.close();
  }
}

/** Base64 of a blob, without the "data:...;base64," prefix. */
function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
