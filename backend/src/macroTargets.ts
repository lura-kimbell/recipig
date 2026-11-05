/**
 * Daily macro targets: what a person aims to eat in a day, nutrient by nutrient,
 * each either "at least" (protein, fiber) or "at most" (calories, sodium).
 *
 * MACRO_NUTRIENTS must match NUTRIENT_KEYS in frontend/src/app/nutrition.ts, and
 * the shape must match MacroTarget in frontend/src/app/macros.ts.
 */

import { ValidationError } from './validate.ts';

export const MACRO_NUTRIENTS = ['calories', 'protein', 'fat', 'carbs', 'fiber', 'sugar', 'sodium'] as const;
export type MacroNutrient = (typeof MACRO_NUTRIENTS)[number];

export const MACRO_DIRECTIONS = ['atLeast', 'atMost'] as const;
export type MacroDirection = (typeof MACRO_DIRECTIONS)[number];

export interface MacroTarget {
  nutrient: MacroNutrient;
  direction: MacroDirection;
  /** kcal for calories, mg for sodium, grams for the rest. */
  amount: number;
}

/** Bigger than any sensible daily figure in any unit (sodium is in mg). */
export const MAX_TARGET_AMOUNT = 100_000;

const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v);

/**
 * Checks a list of targets sent by the browser: known nutrients, at most one
 * target each, a direction and a positive amount. Returned in MACRO_NUTRIENTS
 * order, amounts rounded to one decimal place.
 */
export function parseMacroTargets(input: unknown): MacroTarget[] {
  if (!Array.isArray(input)) throw new ValidationError('Targets must be a list.');
  const byNutrient = new Map<MacroNutrient, MacroTarget>();
  for (const item of input) {
    const { nutrient, direction, amount } = (item ?? {}) as Record<string, unknown>;
    if (!isOneOf(MACRO_NUTRIENTS, nutrient)) {
      throw new ValidationError(`Each target needs a nutrient, one of: ${MACRO_NUTRIENTS.join(', ')}.`);
    }
    if (byNutrient.has(nutrient)) throw new ValidationError(`There can only be one ${nutrient} target.`);
    if (!isOneOf(MACRO_DIRECTIONS, direction)) {
      throw new ValidationError(`The ${nutrient} target must be "atLeast" or "atMost".`);
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > MAX_TARGET_AMOUNT) {
      throw new ValidationError(`The ${nutrient} target must be a number above 0 and at most ${MAX_TARGET_AMOUNT}.`);
    }
    byNutrient.set(nutrient, { nutrient, direction, amount: Math.round(amount * 10) / 10 });
  }
  return MACRO_NUTRIENTS.flatMap((n) => byNutrient.get(n) ?? []);
}

/** Targets read from storage, keeping only well-formed ones (a nutrient may since have been removed). */
export function cleanMacroTargets(stored: unknown): MacroTarget[] {
  if (!Array.isArray(stored)) return [];
  return stored.filter((t): t is MacroTarget => {
    try {
      parseMacroTargets([t]);
      return true;
    } catch {
      return false;
    }
  });
}
