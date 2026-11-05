/**
 * Daily macro targets and how food measures up against them.
 *
 * A target is one nutrient with a direction: "at least" (eat 100 g of protein or
 * more) or "at most" (stay under 2,500 kcal). Food is compared as a list of
 * portions, each a label, its nutrients per serving, and how many servings are
 * eaten. The recipe page passes one portion (a serving of that recipe); a day of
 * meals passes one per recipe, and every comparison keeps each portion's share
 * so a bar can show which meal contributed what.
 *
 * Keep this file free of imports and of TypeScript-only syntax such as enums, so
 * the tests can run it with plain Node. Nutrients have the same keys as
 * `Nutrients` in nutrition.ts; MacroTarget must match backend/src/macroTargets.ts.
 */

export type MacroNutrient = 'calories' | 'protein' | 'fat' | 'carbs' | 'fiber' | 'sugar' | 'sodium';
export type MacroDirection = 'atLeast' | 'atMost';

export interface MacroTarget {
  nutrient: MacroNutrient;
  direction: MacroDirection;
  /** kcal for calories, mg for sodium, grams for the rest. */
  amount: number;
}

/** The nutrients a target can be set for, in the order they are shown. */
export const MACRO_INFO: readonly {
  nutrient: MacroNutrient;
  label: string;
  unit: 'kcal' | 'g' | 'mg';
  /** What most people aim for with this nutrient, offered first when setting a target. */
  usual: MacroDirection;
}[] = [
  { nutrient: 'calories', label: 'Calories', unit: 'kcal', usual: 'atMost' },
  { nutrient: 'protein', label: 'Protein', unit: 'g', usual: 'atLeast' },
  { nutrient: 'carbs', label: 'Carbohydrates', unit: 'g', usual: 'atMost' },
  { nutrient: 'fiber', label: 'Fiber', unit: 'g', usual: 'atLeast' },
  { nutrient: 'sugar', label: 'Sugar', unit: 'g', usual: 'atMost' },
  { nutrient: 'fat', label: 'Fat', unit: 'g', usual: 'atMost' },
  { nutrient: 'sodium', label: 'Sodium', unit: 'mg', usual: 'atMost' },
];

export const macroInfo = (nutrient: MacroNutrient) => MACRO_INFO.find((m) => m.nutrient === nutrient)!;

/** Some food that was (or will be) eaten. */
export interface Portion {
  /** What to call it, e.g. the recipe title. */
  label: string;
  /** Nutrients in one serving. */
  perServing: Readonly<Record<MacroNutrient, number>>;
  /** Servings eaten (1 when left out). */
  servings?: number;
}

/**
 * Where a total stands against its target:
 * - short: an "at least" target not reached yet
 * - met: an "at least" target reached
 * - within: an "at most" target not passed
 * - over: an "at most" target passed
 */
export type MacroStatus = 'short' | 'met' | 'within' | 'over';

export interface MacroComparison {
  target: MacroTarget;
  /** The total from every portion. */
  amount: number;
  /** amount / target amount: 0.5 is halfway, 1.2 is 20% past it. */
  ratio: number;
  status: MacroStatus;
  /** How far the total is from the target: still to eat, still allowed, or how much it is over. Never negative. */
  gap: number;
  /** Each portion's part of the total, in the order given. */
  parts: { label: string; amount: number; ratio: number }[];
}

const servingsOf = (p: Portion) => (p.servings === undefined ? 1 : p.servings);

/** The amount of one nutrient in a portion. */
export const portionAmount = (p: Portion, nutrient: MacroNutrient): number => (p.perServing[nutrient] || 0) * servingsOf(p);

/** Each target, compared with everything in the portions added together. */
export function compareToTargets(portions: readonly Portion[], targets: readonly MacroTarget[]): MacroComparison[] {
  return targets
    .filter((t) => t.amount > 0)
    .map((target) => {
      const parts = portions.map((p) => {
        const amount = portionAmount(p, target.nutrient);
        return { label: p.label, amount, ratio: amount / target.amount };
      });
      const amount = parts.reduce((sum, p) => sum + p.amount, 0);
      const ratio = amount / target.amount;
      const status: MacroStatus =
        target.direction === 'atLeast' ? (amount >= target.amount ? 'met' : 'short') : amount > target.amount ? 'over' : 'within';
      return { target, amount, ratio, status, gap: Math.abs(target.amount - amount), parts };
    });
}

/**
 * How a comparison is drawn as a bar. The bar's full width is the target, or
 * more when the total passes it (up to `MAX_SCALE` times the target), so the
 * target mark moves left and the overflow shows past it. Widths are percentages
 * of the bar.
 */
export interface MacroBar {
  /** Where the target mark sits. */
  targetAt: number;
  /** Each portion's stretch of the fill, end to end. */
  parts: { label: string; width: number }[];
  /** Where the fill ends. */
  fillEnd: number;
  /** The total runs past the end of the bar (more than MAX_SCALE times the target). */
  clipped: boolean;
}

export const MAX_SCALE = 1.5;

export function macroBar(c: MacroComparison): MacroBar {
  const scale = Math.min(Math.max(1, c.ratio), MAX_SCALE);
  const toPercent = (ratio: number) => (ratio / scale) * 100;
  let used = 0;
  const parts = c.parts.map((p) => {
    const width = Math.max(0, Math.min(toPercent(p.ratio), 100 - used));
    used += width;
    return { label: p.label, width };
  });
  return { targetAt: toPercent(1), parts, fillEnd: used, clipped: c.ratio > MAX_SCALE };
}

/** "1,240 kcal", "8.5 g", "36 g", "410 mg". */
export function formatAmount(value: number, unit: string): string {
  const rounded = unit === 'g' && value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${rounded.toLocaleString('en-US')} ${unit}`;
}
