import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { MACRO_INFO, MacroDirection, MacroNutrient, MacroTarget } from './macros';
import { MacroTargetsService } from './macro-targets.service';
import { errorMessage } from './recipe.service';

interface Row {
  nutrient: MacroNutrient;
  label: string;
  unit: string;
  direction: MacroDirection | 'none';
  /** As typed, so a half-typed number isn't lost. */
  amount: string;
}

/**
 * The "Macro targets" dialog: a daily goal per nutrient, either at least or at most
 * an amount. Recipe pages compare a serving with these. Changes are saved with Save.
 */
@Component({
  selector: 'app-macro-targets-dialog',
  template: `
    <dialog #dialog class="dialog macro-dialog" aria-labelledby="macro-title">
      <h2 id="macro-title">Daily macro targets</h2>
      <p class="muted">
        Set what you aim for in a day. Each recipe's nutrition shows how much of it one serving takes up. Leave a nutrient
        on "No target" to skip it.
      </p>
      <form (submit)="$event.preventDefault(); save()">
        <div class="macro-rows">
          @for (row of rows(); track row.nutrient; let i = $index) {
            <div class="macro-row" [class.off]="row.direction === 'none'">
              <label class="macro-name" [for]="'macro-dir-' + row.nutrient">{{ row.label }}</label>
              <select
                [id]="'macro-dir-' + row.nutrient"
                [value]="row.direction"
                (change)="setDirection(i, $any($event.target).value)"
              >
                <option value="none">No target</option>
                <option value="atLeast">At least</option>
                <option value="atMost">At most</option>
              </select>
              <span class="macro-amount">
                <input
                  type="number"
                  inputmode="decimal"
                  min="0"
                  step="any"
                  [value]="row.amount"
                  [attr.aria-label]="row.label + ' target in ' + row.unit"
                  placeholder="—"
                  (input)="setAmount(i, $any($event.target).value)"
                />
                <span class="muted small">{{ row.unit }}</span>
              </span>
            </div>
          }
        </div>
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        <div class="actions">
          <button type="button" class="btn" (click)="close()" [disabled]="busy()">Cancel</button>
          <button type="submit" class="btn primary" [disabled]="busy()">Save</button>
        </div>
      </form>
    </dialog>
  `,
})
export class MacroTargetsDialog {
  private readonly service = inject(MacroTargetsService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly rows = signal<Row[]>([]);
  readonly error = signal('');
  readonly busy = signal(false);

  /** Opens with the saved targets filled in. */
  open(): void {
    const saved = new Map(this.service.targets().map((t) => [t.nutrient, t]));
    this.rows.set(
      MACRO_INFO.map((m) => {
        const t = saved.get(m.nutrient);
        return {
          nutrient: m.nutrient,
          label: m.label,
          unit: m.unit,
          direction: t?.direction ?? 'none',
          amount: t ? String(t.amount) : '',
        };
      }),
    );
    this.error.set('');
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  setDirection(i: number, direction: Row['direction']): void {
    this.updateRow(i, { direction });
  }

  /** Typing an amount for a nutrient with no target turns on its usual kind of target. */
  setAmount(i: number, amount: string): void {
    const row = this.rows()[i];
    const usual = MACRO_INFO.find((m) => m.nutrient === row.nutrient)!.usual;
    this.updateRow(i, { amount, direction: row.direction === 'none' && amount.trim() ? usual : row.direction });
  }

  async save(): Promise<void> {
    const targets: MacroTarget[] = [];
    for (const row of this.rows()) {
      if (row.direction === 'none') continue;
      const amount = Number(row.amount);
      if (!row.amount.trim() || !Number.isFinite(amount) || amount <= 0) {
        this.error.set(`Enter an amount above 0 for ${row.label}, or set it to "No target".`);
        return;
      }
      targets.push({ nutrient: row.nutrient, direction: row.direction, amount });
    }
    this.busy.set(true);
    this.error.set('');
    try {
      await this.service.save(targets);
      this.close();
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  private updateRow(i: number, change: Partial<Row>): void {
    this.rows.update((rows) => rows.map((r, j) => (j === i ? { ...r, ...change } : r)));
  }
}
