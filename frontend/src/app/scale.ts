/**
 * Scale the amounts in a line of recipe text: "3/4 cup sharp cheddar" doubled is
 * "1 1/2 cups sharp cheddar".
 *
 * Ingredient lines are free text, so this reads amounts the way a cook would:
 * whole numbers, decimals, fractions ("3/4"), mixed numbers ("1 1/2"), fraction
 * glyphs ("½", "1½"), ranges ("2-3", "1/2 to 1") and amounts inside brackets
 * ("(130g)"). Fractions come back as fractions in the same style they went in.
 * Words that name the amount get fixed up too ("1 cup" -> "2 cups", "1 egg" ->
 * "2 eggs").
 *
 * Numbers that aren't amounts are left alone: "2% milk", "80/20 beef", "350°F",
 * "a 2-inch piece", and the size in "1 (14 oz) can".
 *
 * Keep this file free of imports and of TypeScript-only syntax such as enums, so
 * the tests can run it with plain Node.
 */

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
const GLYPH_CLASS = '½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞';

/** The fractions a scaled amount is snapped to: value, numerator, denominator, glyph. */
const FRACTIONS: [number, number, number, string][] = [
  [1 / 8, 1, 8, '⅛'],
  [1 / 6, 1, 6, '⅙'],
  [1 / 4, 1, 4, '¼'],
  [1 / 3, 1, 3, '⅓'],
  [3 / 8, 3, 8, '⅜'],
  [1 / 2, 1, 2, '½'],
  [5 / 8, 5, 8, '⅝'],
  [2 / 3, 2, 3, '⅔'],
  [3 / 4, 3, 4, '¾'],
  [5 / 6, 5, 6, '⅚'],
  [7 / 8, 7, 8, '⅞'],
];

/** One amount: mixed number, fraction, number plus glyph, glyph, number with thousands commas, decimal, or integer. */
const QTY = `(?:\\d+\\s+\\d+/\\d+|\\d+/\\d+|\\d+\\s?[${GLYPH_CLASS}]|[${GLYPH_CLASS}]|\\d+(?:,\\d{3})+(?:\\.\\d+)?|\\d*\\.\\d+|\\d+)`;

interface Qty {
  value: number;
  /** How it was written, so the result can be written the same way. */
  style: 'int' | 'decimal' | 'ascii' | 'unicode';
  comma?: boolean;
  spaced?: boolean;
}

function parseQty(token: string): Qty | null {
  let m = /^(\d+)\s+(\d+)\/(\d+)$/.exec(token);
  if (m) {
    const n = Number(m[2]);
    const d = Number(m[3]);
    return d > 0 && n < d ? { value: Number(m[1]) + n / d, style: 'ascii' } : null;
  }
  m = /^(\d+)\/(\d+)$/.exec(token);
  if (m) {
    const n = Number(m[1]);
    const d = Number(m[2]);
    // "80/20" is a ratio, not a fraction.
    return d > 0 && n < d ? { value: n / d, style: 'ascii' } : null;
  }
  m = new RegExp(`^(\\d+)(\\s?)([${GLYPH_CLASS}])$`, 'u').exec(token);
  if (m) return { value: Number(m[1]) + GLYPHS[m[3]], style: 'unicode', spaced: m[2] !== '' };
  if (token.length === 1 && GLYPHS[token] !== undefined) return { value: GLYPHS[token], style: 'unicode' };
  if (/^\d+(?:,\d{3})+(?:\.\d+)?$/.test(token)) {
    return { value: Number(token.replace(/,/g, '')), style: token.includes('.') ? 'decimal' : 'int', comma: true };
  }
  if (/^\d*\.\d+$/.test(token)) return { value: Number(token), style: 'decimal' };
  if (/^\d+$/.test(token)) return { value: Number(token), style: 'int' };
  return null;
}

const round2 = (n: number): string => String(Math.round(n * 100) / 100);

function format(value: number, q: Qty): string {
  if (q.style === 'int' || q.style === 'decimal') {
    if (Number.isInteger(value)) return q.comma ? value.toLocaleString('en-US') : String(value);
    return round2(value);
  }
  const whole = Math.floor(value + 1e-9);
  const frac = value - whole;
  if (frac < 0.012) return whole > 0 ? String(whole) : round2(value);
  if (frac > 0.988) return String(whole + 1);
  const match = FRACTIONS.find(([v]) => Math.abs(frac - v) < 0.012);
  if (!match) return round2(value);
  const [, n, d, glyph] = match;
  if (q.style === 'unicode') return whole > 0 ? `${whole}${q.spaced ? ' ' : ''}${glyph}` : glyph;
  return whole > 0 ? `${whole} ${n}/${d}` : `${n}/${d}`;
}

// ---------------------------------------------------------------------------
// Grammar: "1 cup" -> "2 cups", "1 egg" -> "2 eggs"
// ---------------------------------------------------------------------------

/** Units and containers that take an "s" (or something like it) when there is more than one. */
const UNIT_PLURALS: Record<string, string> = {
  cup: 'cups',
  tablespoon: 'tablespoons',
  teaspoon: 'teaspoons',
  ounce: 'ounces',
  pound: 'pounds',
  quart: 'quarts',
  pint: 'pints',
  gallon: 'gallons',
  clove: 'cloves',
  stick: 'sticks',
  pinch: 'pinches',
  dash: 'dashes',
  splash: 'splashes',
  handful: 'handfuls',
  knob: 'knobs',
  drop: 'drops',
  can: 'cans',
  tin: 'tins',
  jar: 'jars',
  package: 'packages',
  packet: 'packets',
  envelope: 'envelopes',
  bottle: 'bottles',
  box: 'boxes',
  carton: 'cartons',
  container: 'containers',
  tub: 'tubs',
  bag: 'bags',
  glass: 'glasses',
  slice: 'slices',
  piece: 'pieces',
  strip: 'strips',
  sheet: 'sheets',
  wedge: 'wedges',
  cube: 'cubes',
  fillet: 'fillets',
  sprig: 'sprigs',
  bunch: 'bunches',
  head: 'heads',
  stalk: 'stalks',
  rib: 'ribs',
  ear: 'ears',
  bulb: 'bulbs',
  link: 'links',
  scoop: 'scoops',
  loaf: 'loaves',
};

/** Abbreviations that are the same whether there is one or many: "1 tsp", "3 tsp". */
const FIXED_UNITS = new Set(
  'tsp tsps tbsp tbsps tbs tbl tbls oz lb lbs g gr kg mg ml l dl cl qt pt gal c fl pkg'.split(' '),
);

/** Words that can sit between an amount and its unit: "1 large handful". */
const SIZE_WORDS = new Set([
  'large',
  'medium',
  'small',
  'big',
  'heaping',
  'heaped',
  'level',
  'generous',
  'scant',
  'rounded',
  'packed',
]);

const IRREGULAR_PLURALS: Record<string, string> = { leaf: 'leaves', loaf: 'loaves', half: 'halves', knife: 'knives' };

/** Nouns that stay as they are even when there are several. */
const NO_PLURAL = new Set(
  (
    'fish sheep deer water milk cream flour sugar salt butter oil rice pasta spinach broccoli celery parsley ' +
    'cilantro basil thyme rosemary dill mint sage garlic ginger honey vinegar wine broth stock juice zest yeast ' +
    'cheese meat beef pork lamb bacon lettuce kale cabbage corn bread fruit tofu hummus mustard mayonnaise ' +
    'ketchup salsa sauce cinnamon nutmeg cumin paprika oregano chocolate vanilla coffee tea'
  ).split(' '),
);

const matchCase = (original: string, replacement: string): string =>
  original[0] !== original[0].toLowerCase() && original.slice(1) === original.slice(1).toLowerCase()
    ? replacement[0].toUpperCase() + replacement.slice(1)
    : replacement;

/** Plural of a countable noun, or the word itself if it is already plural or shouldn't change. */
function pluralizeNoun(word: string): string {
  const lower = word.toLowerCase();
  if (lower.length < 3 || NO_PLURAL.has(lower) || lower.endsWith('s')) return word;
  const irregular = IRREGULAR_PLURALS[lower];
  if (irregular) return matchCase(word, irregular);
  if (/(?:x|z|ch|sh)$/.test(lower) || lower === 'tomato' || lower === 'potato') return `${word}es`;
  if (/[^aeiou]y$/.test(lower)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

const WORD = /^[\p{L}][\p{L}'’-]*/u;

/**
 * Find the word that should become plural after an amount that is now more than
 * one: the unit if there is one ("cup", "can", "large handful"), otherwise the
 * thing being counted ("egg", "chicken breast", "lemon" in "juice of 1 lemon").
 * Returns the word's range and its new form, or null if nothing needs changing.
 */
function pluralTarget(
  text: string,
  from: number,
  countsNoun: boolean,
): { start: number; end: number; word: string } | null {
  let i = from;
  const skipSpace = () => {
    while (i < text.length && /\s/.test(text[i])) i++;
  };
  skipSpace();
  // "1 (14 oz) can": step over a bracketed size to reach the unit.
  if (text[i] === '(') {
    const close = text.indexOf(')', i);
    if (close === -1) return null;
    i = close + 1;
    skipSpace();
  }
  for (let guard = 0; guard < 3; guard++) {
    const m = WORD.exec(text.slice(i));
    if (!m || !SIZE_WORDS.has(m[0].toLowerCase())) break;
    i += m[0].length;
    skipSpace();
  }
  const m = WORD.exec(text.slice(i));
  if (!m) return null;

  const lowered = m[0].toLowerCase();
  if (FIXED_UNITS.has(lowered)) return null;
  const unit = UNIT_PLURALS[lowered];
  if (unit) return { start: i, end: i + m[0].length, word: matchCase(m[0], unit) };
  if (!countsNoun) return null;

  // No unit, so the amount counts the thing itself: take the last real word before a comma,
  // bracket or linking word ("1 large egg, beaten", "1 onion finely chopped").
  const rest = text.slice(i);
  const cut = rest.search(/[,(;]|\s(?:for|to|or|and|plus|of|in|with|into)\s/i);
  const phrase = cut === -1 ? rest : rest.slice(0, cut);
  const words = [...phrase.matchAll(/[\p{L}][\p{L}'’-]*/gu)];
  for (let k = words.length - 1; k >= 0; k--) {
    const w = words[k][0];
    if (/(?:ed|ly|ing)$/i.test(w) && words.length > 1 && k > 0) continue; // "finely", "chopped"
    const plural = pluralizeNoun(w);
    if (plural === w) return null;
    const start = i + (words[k].index ?? 0);
    return { start, end: start + w.length, word: matchCase(w, plural) };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Scaling
// ---------------------------------------------------------------------------

const CONTAINERS =
  'cans?|tins?|jars?|packages?|pkgs?|packets?|envelopes?|bottles?|box(?:es)?|cartons?|containers?|tubs?|bags?|sticks?|cubes?';

/**
 * "(14 oz)" in "1 (14 oz) can" is the size of each can, not an amount to scale;
 * the 1 in front is what changes.
 */
const CAN_SIZE = new RegExp(
  `\\(\\s*${QTY}\\s*(?:fl\\.?\\s*oz|oz|ounces?|g|grams?|kg|ml|l|lbs?|pounds?|cups?)\\.?\\s*\\)(?=\\s*(?:${CONTAINERS})\\b)`,
  'giu',
);

const RANGE_TAIL = new RegExp(`^(\\s*[-–—]\\s*|\\s+to\\s+)(${QTY})`, 'iu');

export function scaleIngredientText(text: string, factor: number): string {
  if (!text || !Number.isFinite(factor) || factor <= 0 || factor === 1) return text;

  const protectedSpans = [...text.matchAll(CAN_SIZE)].map((m) => [m.index ?? 0, (m.index ?? 0) + m[0].length]);
  const isProtected = (i: number) => protectedSpans.some(([a, b]) => i >= a && i < b);

  const re = new RegExp(`(?<![\\p{L}\\d.,/])${QTY}`, 'gu');
  let out = '';
  let pos = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    const start = m.index;
    if (isProtected(start)) continue;
    const first = parseQty(m[0]);
    if (!first) continue;

    // "2 x 400g tins": only the count scales, not the size of each.
    if (/(?:^|\s)[x×]\s*$/i.test(text.slice(0, start))) continue;

    let end = start + m[0].length;
    let second: Qty | null = null;
    let separator = '';
    let mixed: Qty | null = null;

    const tail = RANGE_TAIL.exec(text.slice(end));
    if (tail) {
      const candidate = parseQty(tail[2]);
      if (candidate) {
        if (first.style === 'int' && candidate.style === 'ascii' && candidate.value < 1 && /^-$/.test(tail[1])) {
          // "1-1/2" is one and a half, not a range.
          mixed = { value: first.value + candidate.value, style: 'ascii' };
        } else {
          second = candidate;
          separator = tail[1];
        }
        end += tail[0].length;
      }
    }

    const after = text.slice(end);
    if (/^[%°º]/.test(after)) continue; // "2% milk", "350°F"
    if (/^-[\p{L}]/u.test(after)) continue; // "a 2-inch piece"
    if (/^\s*[x×]\s*\d+(?:\.\d+)?\s*-?\s*(?:inch|inches|in|cm|mm)\b/i.test(after)) continue; // "9 x 13 inch"

    const firstQty = mixed ?? first;
    const largest = Math.max(firstQty.value, second?.value ?? 0);
    let piece = format(firstQty.value * factor, firstQty);
    if (second) piece += separator + format(second.value * factor, second);

    out += text.slice(pos, start) + piece;
    pos = end;

    // Was one (or less), now several: "cup" -> "cups", "egg" -> "eggs".
    if (largest <= 1 && largest * factor > 1) {
      const before = text.slice(0, start).trim();
      const countsNoun = before === '' || /\b(?:juice|zest|peel|rind) of$/i.test(before);
      const target = pluralTarget(text, end, countsNoun);
      if (target) {
        out += text.slice(pos, target.start) + target.word;
        pos = target.end;
      }
    }
    re.lastIndex = Math.max(re.lastIndex, pos);
  }
  return out + text.slice(pos);
}
