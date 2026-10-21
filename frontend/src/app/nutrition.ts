/**
 * Estimate a recipe's nutrition from its ingredient lines.
 *
 * Each line is read the way a cook would write it: an amount ("1 1/2", "½",
 * "2-3", "a"), an optional unit ("cup", "tbsp", "200g", "1 (14 oz) can",
 * "2 x 400g tins") and the food ("all-purpose flour, sifted"). The food is
 * looked up in a table of reference values (see nutrition-data.ts), the amount
 * is turned into grams, and the totals are added up. Lines without an amount
 * ("salt to taste") or with a food that isn't in the table are reported, not
 * guessed.
 *
 * Keep this file free of imports and of TypeScript-only syntax such as enums, so
 * the tests can run it with plain Node. The food table is passed in.
 */

/** Per 100 g: calories (kcal), then grams of protein, fat, carbs, fiber and sugar, then sodium in mg. */
export interface Nutrients {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  sugar: number;
  sodium: number;
}

export interface Food {
  /** Names that identify the food in an ingredient line, e.g. ["all-purpose flour", "plain flour", "flour"]. */
  names: string[];
  per100g: Nutrients;
  /** Grams in one US cup, for converting cups, spoons and millilitres. */
  gramsPerCup?: number;
  /** Grams in one of the item ("2 eggs", "1 onion", "3 cloves garlic" when no clove weight is set). */
  gramsEach?: number;
  /** Grams in one of a named unit, e.g. { clove: 3 } for garlic or { stick: 113 } for butter. */
  units?: Record<string, number>;
}

export interface NutritionEstimate {
  total: Nutrients;
  /** Lines that were counted. */
  counted: number;
  /** Lines left out, with the reason. */
  skipped: { text: string; reason: 'no amount' | 'unknown food' | 'unknown unit' }[];
}

export const NUTRIENT_KEYS = ['calories', 'protein', 'fat', 'carbs', 'fiber', 'sugar', 'sodium'] as const;

export const zeroNutrients = (): Nutrients => ({ calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0, sugar: 0, sodium: 0 });

export function scaleNutrients(n: Nutrients, factor: number): Nutrients {
  const out = zeroNutrients();
  for (const k of NUTRIENT_KEYS) out[k] = n[k] * factor;
  return out;
}

// ---------------------------------------------------------------------------
// Amounts
// ---------------------------------------------------------------------------

const GLYPHS: Record<string, number> = {
  '½': 1 / 2,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 1 / 4,
  '¾': 3 / 4,
  '⅕': 1 / 5,
  '⅖': 2 / 5,
  '⅗': 3 / 5,
  '⅘': 4 / 5,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
  '⅛': 1 / 8,
  '⅜': 3 / 8,
  '⅝': 5 / 8,
  '⅞': 7 / 8,
};

/** "1½" -> "1 1/2", "½" -> "1/2", so only ASCII forms need parsing. */
function asciiFractions(s: string): string {
  return s.replace(/(\d?)\s?([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g, (_, whole: string, glyph: string) => {
    const v = GLYPHS[glyph];
    const [n, d] = FRACTION_PARTS.get(v) ?? [Math.round(v * 8), 8];
    return `${whole ? `${whole} ` : ''}${n}/${d}`;
  });
}
const FRACTION_PARTS = new Map<number, [number, number]>(
  [
    [1, 2],
    [1, 3],
    [2, 3],
    [1, 4],
    [3, 4],
    [1, 5],
    [2, 5],
    [3, 5],
    [4, 5],
    [1, 6],
    [5, 6],
    [1, 8],
    [3, 8],
    [5, 8],
    [7, 8],
  ].map(([n, d]) => [n / d, [n, d]]),
);

const NUMBER = String.raw`(?:\d+\s+\d+/\d+|\d+/\d+|\d+(?:\.\d+)?|\.\d+)`;
/** An amount, or a range of two ("2-3", "1/2 to 1"). */
const AMOUNT = new RegExp(String.raw`^(${NUMBER})(?:\s*(?:-|–|—|to|or)\s*(${NUMBER}))?`);

function numberValue(token: string): number {
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(token);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = /^(\d+)\/(\d+)$/.exec(token);
  if (frac) return Number(frac[2]) > 0 ? Number(frac[1]) / Number(frac[2]) : NaN;
  return Number(token);
}

/** The amount at the start of the text and what follows it; a range counts as its middle. */
function readAmount(text: string): { value: number; rest: string } | null {
  const m = AMOUNT.exec(text);
  if (m) {
    const a = numberValue(m[1]);
    const b = m[2] ? numberValue(m[2]) : a;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return { value: (a + b) / 2, rest: text.slice(m[0].length) };
  }
  const word = /^(?:an?|one)\s+/.exec(text);
  if (word) return { value: 1, rest: text.slice(word[0].length) };
  return null;
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

/** Mass units in grams. */
const MASS: Record<string, number> = {
  g: 1,
  gr: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
  mg: 0.001,
  oz: 28.35,
  ounce: 28.35,
  ounces: 28.35,
  lb: 453.6,
  lbs: 453.6,
  pound: 453.6,
  pounds: 453.6,
};

/** Volume units in millilitres. */
const VOLUME: Record<string, number> = {
  ml: 1,
  milliliter: 1,
  milliliters: 1,
  millilitre: 1,
  millilitres: 1,
  cl: 10,
  dl: 100,
  l: 1000,
  liter: 1000,
  liters: 1000,
  litre: 1000,
  litres: 1000,
  tsp: 4.93,
  tsps: 4.93,
  teaspoon: 4.93,
  teaspoons: 4.93,
  tbsp: 14.79,
  tbsps: 14.79,
  tbs: 14.79,
  tbl: 14.79,
  tablespoon: 14.79,
  tablespoons: 14.79,
  cup: 236.6,
  cups: 236.6,
  c: 236.6,
  'fl oz': 29.57,
  'fluid ounce': 29.57,
  'fluid ounces': 29.57,
  pint: 473,
  pints: 473,
  pt: 473,
  quart: 946,
  quarts: 946,
  qt: 946,
  gallon: 3785,
  gallons: 3785,
  pinch: 0.31,
  pinches: 0.31,
  dash: 0.62,
  dashes: 0.62,
  splash: 5,
  splashes: 5,
};

/** Units that count things; their weight depends on the food. Plural -> singular. */
const COUNT_UNITS: Record<string, string> = {};
for (const unit of (
  'clove stalk rib head bunch sprig slice piece fillet filet link ear can tin jar package packet envelope bottle ' +
  'stick block sheet cube handful bag container box carton strip leaf breast thigh wing drumstick steak chop'
).split(' ')) {
  COUNT_UNITS[unit] = unit;
  COUNT_UNITS[unit.endsWith('x') || unit.endsWith('ch') ? `${unit}es` : `${unit}s`] = unit;
}
COUNT_UNITS['leaves'] = 'leaf';
COUNT_UNITS['pkg'] = 'package';
COUNT_UNITS['pkgs'] = 'package';

/** Weights for count units when the food doesn't give its own. */
const DEFAULT_UNIT_GRAMS: Record<string, number> = { can: 400, tin: 400, handful: 30 };

/** Count units that mean "one of the food itself" when the food has no specific weight for them. */
const EACH_UNITS = new Set(['piece', 'head', 'breast', 'thigh', 'wing', 'drumstick', 'steak', 'chop', 'fillet', 'filet', 'ear']);

const SIZE_WORDS = /^(?:(?:large|medium|small|big|extra[- ]large|jumbo|heaping|heaped|level|generous|scant|rounded|packed|whole)\s+)+/;

type Unit = { kind: 'mass'; grams: number } | { kind: 'volume'; ml: number } | { kind: 'count'; unit: string };

/** The unit at the start of the text ("cups flour" -> cup), and what follows it. */
function readUnit(text: string): { unit: Unit | null; rest: string } {
  const m = /^(fl\.?\s*oz|fluid ounces?|[a-z]+)\.?(?![a-z])/.exec(text);
  if (m) {
    const word = m[1].replace(/^fl\.?\s*oz$/, 'fl oz');
    const rest = text.slice(m[0].length).replace(/^\s*of\s+/, '').trimStart();
    if (MASS[word] !== undefined) return { unit: { kind: 'mass', grams: MASS[word] }, rest };
    if (VOLUME[word] !== undefined) return { unit: { kind: 'volume', ml: VOLUME[word] }, rest };
    if (COUNT_UNITS[word]) return { unit: { kind: 'count', unit: COUNT_UNITS[word] }, rest };
  }
  return { unit: null, rest: text };
}

/** A weight or volume such as "400g" or "15-ounce", and what follows it. */
function readSize(text: string): { size: { grams?: number; ml?: number }; rest: string } | null {
  const amount = readAmount(text);
  if (!amount) return null;
  const { unit, rest } = readUnit(amount.rest.replace(/^[\s-]+/, ''));
  if (unit?.kind === 'mass') return { size: { grams: amount.value * unit.grams }, rest };
  if (unit?.kind === 'volume') return { size: { ml: amount.value * unit.ml }, rest };
  return null;
}

// ---------------------------------------------------------------------------
// Foods
// ---------------------------------------------------------------------------

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "tomato" also matches "tomatoes", "berry" matches "berries". */
function namePattern(name: string): RegExp {
  const base = escapeRe(name).replace(/\\?\s+/g, '[\\s-]+');
  const stem = /y$/.test(name) ? `${base.slice(0, -1)}(?:y|ies)` : `${base}(?:e?s)?`;
  return new RegExp(`(?<![a-z])${stem}(?![a-z])`);
}

const patternCache = new WeakMap<Food, RegExp[]>();

/** The food whose longest matching name is longest: "brown sugar" beats "sugar", "chicken broth" beats "chicken". */
export function findFood(description: string, foods: readonly Food[]): Food | null {
  let best: Food | null = null;
  let bestLength = 0;
  for (const food of foods) {
    let patterns = patternCache.get(food);
    if (!patterns) {
      patterns = food.names.map(namePattern);
      patternCache.set(food, patterns);
    }
    for (let i = 0; i < food.names.length; i++) {
      if (food.names[i].length > bestLength && patterns[i].test(description)) {
        best = food;
        bestLength = food.names[i].length;
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

export type LineResult =
  | { ok: true; food: Food; grams: number }
  | { ok: false; reason: 'no amount' | 'unknown food' | 'unknown unit' };

/** How many grams of which food a single ingredient line describes. */
export function readIngredient(line: string, foods: readonly Food[]): LineResult {
  const text = asciiFractions(line.toLowerCase())
    .replace(/^[\s•*▢☐□-]+/, '')
    .replace(/\s+/g, ' ')
    .trim();

  const amount = readAmount(text);
  if (!amount) return { ok: false, reason: 'no amount' };
  let count = amount.value;
  let rest = amount.rest.trimStart();

  // The size of each container: "1 (14 oz) can", "2 x 400g tins", "2 15-ounce cans".
  let size: { grams?: number; ml?: number } | null = null;
  const bracket = /^\(([^)]*)\)\s*/.exec(rest);
  if (bracket) {
    size = readSize(bracket[1].trim())?.size ?? null;
    rest = rest.slice(bracket[0].length);
  } else {
    const times = /^[x×]\s*/.exec(rest);
    const sized = readSize(times ? rest.slice(times[0].length) : rest);
    if (sized && (times || readUnit(sized.rest).unit?.kind === 'count')) {
      size = sized.size;
      rest = sized.rest;
    }
  }

  rest = rest.replace(SIZE_WORDS, '');
  const { unit, rest: description } = readUnit(rest);

  // The food's name is usually before the first comma ("chicken thighs, boneless"); fall back to the whole line.
  const main = description.split(/[,(;]/)[0];
  const food = findFood(main, foods) ?? findFood(description, foods);
  if (!food) return { ok: false, reason: 'unknown food' };

  const fromMl = (ml: number) => (food.gramsPerCup ? (ml * food.gramsPerCup) / 236.6 : null);

  let grams: number | null = null;
  if (size && (!unit || unit.kind === 'count')) {
    grams = size.grams !== undefined ? count * size.grams : fromMl(count * (size.ml ?? 0));
  } else if (unit?.kind === 'mass') {
    grams = count * unit.grams;
  } else if (unit?.kind === 'volume') {
    grams = fromMl(count * unit.ml);
  } else if (unit?.kind === 'count') {
    const each =
      food.units?.[unit.unit] ??
      (EACH_UNITS.has(unit.unit) ? food.gramsEach : undefined) ??
      DEFAULT_UNIT_GRAMS[unit.unit];
    grams = each !== undefined ? count * each : null;
  } else if (food.gramsEach !== undefined) {
    grams = count * food.gramsEach;
  }

  if (grams === null || !Number.isFinite(grams)) return { ok: false, reason: 'unknown unit' };
  return { ok: true, food, grams };
}

/** Add up the nutrition of every ingredient line that can be read. */
export function estimateNutrition(lines: readonly string[], foods: readonly Food[]): NutritionEstimate {
  const total = zeroNutrients();
  const skipped: NutritionEstimate['skipped'] = [];
  let counted = 0;
  for (const line of lines) {
    const result = readIngredient(line, foods);
    if (!result.ok) {
      skipped.push({ text: line, reason: result.reason });
      continue;
    }
    counted++;
    for (const k of NUTRIENT_KEYS) total[k] += (result.food.per100g[k] * result.grams) / 100;
  }
  return { total, counted, skipped };
}

/** The number of servings in a "Serves 4-6" / "8 servings" / "Makes 24 cookies" line (the lower end of a range). */
export function servingCount(servings: string | undefined): number | null {
  const m = /(\d+(?:\.\d+)?)/.exec(servings ?? '');
  const n = m ? Number(m[1]) : NaN;
  return n > 0 ? n : null;
}
