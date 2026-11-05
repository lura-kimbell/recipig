import { Component, computed, input } from '@angular/core';
import { MacroComparison, formatAmount, macroBar, macroInfo } from './macros';

/**
 * Bars comparing food with the daily macro targets: one per target, filled by how
 * much of it the food takes up. An "at most" target that's passed overflows past
 * its mark in a warning stripe. With several portions (a day of meals) each one
 * gets its own stretch of the fill.
 */
@Component({
  selector: 'app-macro-bars',
  template: `
    <ul class="macro-bars" role="list">
      @for (row of rows(); track row.c.target.nutrient) {
        <li class="macro-bar" [attr.data-status]="row.c.status" [attr.data-direction]="row.c.target.direction">
          <div class="macro-bar-head">
            <span class="macro-bar-name">{{ row.label }}</span>
            <span class="macro-bar-value">
              <strong>{{ row.amount }}</strong>
              <span class="muted"> / {{ row.goal }}</span>
            </span>
          </div>
          <div class="meter" aria-hidden="true">
            <div class="meter-fill" [style.width.%]="row.bar.fillEnd">
              @for (part of row.bar.parts; track $index) {
                @if (part.width > 0) {
                  <span class="meter-part" [style.flex-grow]="part.width" [title]="part.label"></span>
                }
              }
            </div>
            <!-- Under the target, the end of the bar is the target; past it, a mark shows where it was. -->
            @if (row.c.ratio > 1) {
              <span
                class="meter-past"
                [style.left.%]="row.bar.targetAt"
                [style.width.%]="row.bar.fillEnd - row.bar.targetAt"
              ></span>
              <span class="meter-target" [style.left.%]="row.bar.targetAt"></span>
            }
            @if (row.bar.clipped) {
              <span class="meter-more">»</span>
            }
          </div>
          <p class="macro-bar-note">
            <span class="macro-kind">{{ row.kind }}</span>
            <span class="macro-percent">{{ row.percent }}%</span>
            <span class="macro-status">{{ row.status }}</span>
          </p>
        </li>
      }
    </ul>
  `,
})
export class MacroBars {
  readonly comparisons = input.required<MacroComparison[]>();

  readonly rows = computed(() =>
    this.comparisons().map((c) => {
      const { label, unit } = macroInfo(c.target.nutrient);
      const gap = formatAmount(c.gap, unit);
      const status = {
        short: `${gap} to go`,
        met: c.gap > 0 ? `Reached, ${gap} past it` : 'Reached',
        within: `${gap} to spare`,
        over: `${gap} over`,
      }[c.status];
      return {
        c,
        label,
        amount: formatAmount(c.amount, unit),
        goal: formatAmount(c.target.amount, unit),
        kind: c.target.direction === 'atLeast' ? 'At least' : 'At most',
        percent: Math.round(c.ratio * 100),
        status,
        bar: macroBar(c),
      };
    }),
  );
}
