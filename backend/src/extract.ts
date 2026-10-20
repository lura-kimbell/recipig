import * as cheerio from 'cheerio';
import { randomUUID } from 'node:crypto';
import { linkIngredientsToStep } from './link.ts';
import type { RecipeDraft } from './types.ts';

export class NoRecipeError extends Error {
  constructor() {
    super(
      "Couldn't find a recipe on that page. Some sites don't publish their recipe in a form that can be imported.",
    );
  }
}

interface RawRecipe {
  title: string;
  ingredients: string[];
  steps: string[];
  servings?: string;
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  image?: string;
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const toArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v]);

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/** HTML (or plain text with entities) to plain text, turning block ends and <br> into newlines. */
function htmlToText(s: string): string {
  const withBreaks = s.replace(/<\/(p|li|div|h[1-6])>|<br\s*\/?>/gi, '\n');
  return cheerio.load(`<body>${withBreaks}</body>`)('body').text();
}

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** A single line of text with markup, entities and checkbox glyphs removed. */
function cleanLine(s: string): string {
  return squash(htmlToText(s)).replace(/^[▢☐□◻▪•*]\s*/, '');
}

function text(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return cleanLine(String(v));
  if (isObj(v)) return text(v['@value'] ?? v.text ?? v.name);
  return '';
}

/** Split instruction text into steps and drop leading "1." / "Step 2:" numbering. */
function stringToSteps(s: string): string[] {
  return htmlToText(s)
    .split(/\n+/)
    .map((line) => squash(line).replace(/^(?:step\s*)?\d+\s*[.):]\s+/i, ''))
    .filter(Boolean);
}

/** recipeInstructions can be a string, a list of strings, HowToStep objects, or HowToSections of steps. */
function flattenInstructions(v: unknown): string[] {
  if (v == null) return [];
  if (typeof v === 'string') return stringToSteps(v);
  if (Array.isArray(v)) return v.flatMap(flattenInstructions);
  if (isObj(v)) {
    if (v.itemListElement != null) return flattenInstructions(v.itemListElement);
    const t = v.text ?? v.name;
    return typeof t === 'string' ? stringToSteps(t) : [];
  }
  return [];
}

/** ISO 8601 durations ("PT1H30M") to something readable ("1 hr 30 min"). */
function formatDuration(v: unknown): string | undefined {
  const raw = text(v);
  if (!raw) return undefined;
  const m = raw.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!m) return raw;
  const [, d, h, min] = m;
  const parts = [d && `${Number(d)} d`, h && `${Number(h)} hr`, min && `${Number(min)} min`].filter(Boolean);
  return parts.length ? parts.join(' ') : undefined;
}

function formatYield(v: unknown): string | undefined {
  const items = toArray(v).map(text).filter(Boolean);
  if (items.length === 0) return undefined;
  return items.find((s) => /[a-z]/i.test(s)) ?? `${items[0]} servings`;
}

function firstImage(v: unknown, base?: string): string | undefined {
  const first = toArray(v)[0];
  const raw = typeof first === 'string' ? first : isObj(first) ? (first.url ?? first.contentUrl) : undefined;
  if (typeof raw !== 'string') return undefined;
  try {
    const u = new URL(raw, base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Finding the recipe
// ---------------------------------------------------------------------------

function parseJson(raw: string): unknown {
  const attempts = [
    raw,
    raw.replace(/^\s*<!--/, '').replace(/-->\s*$/, ''),
    // Some sites leave raw newlines inside the JSON; treat control characters as spaces.
    raw.replace(/[\u0000-\u001F]+/g, ' '),
  ];
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch {
      // try the next repair
    }
  }
  return null;
}

function isRecipeNode(o: Obj): boolean {
  return toArray(o['@type']).some((t) => typeof t === 'string' && t.toLowerCase().endsWith('recipe'));
}

function findRecipeNode(value: unknown, depth = 0): Obj | null {
  if (depth > 6) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRecipeNode(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!isObj(value)) return null;
  if (isRecipeNode(value)) return value;
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item']) {
    const found = findRecipeNode(value[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function fromJsonLd($: cheerio.CheerioAPI, base?: string): RawRecipe | null {
  let firstFound: RawRecipe | null = null;
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    const node = findRecipeNode(parseJson($(el).text()));
    if (!node) continue;
    const candidate: RawRecipe = {
      title: text(node.name),
      ingredients: toArray(node.recipeIngredient ?? node.ingredients).map(text).filter(Boolean),
      steps: flattenInstructions(node.recipeInstructions),
      servings: formatYield(node.recipeYield),
      prepTime: formatDuration(node.prepTime),
      cookTime: formatDuration(node.cookTime),
      totalTime: formatDuration(node.totalTime),
      image: firstImage(node.image, base),
    };
    // Some sites publish a stub (title and image, but no ingredients or steps).
    // Keep looking for a complete one, and fall back to the stub for its details.
    if (candidate.ingredients.length > 0 && candidate.steps.length > 0) return candidate;
    firstFound ??= candidate;
  }
  return firstFound;
}

/** Older sites mark recipes up with schema.org microdata instead of JSON-LD. */
function fromMicrodata($: cheerio.CheerioAPI, base?: string): RawRecipe | null {
  const root = $('[itemtype*="schema.org/Recipe"]').first();
  if (root.length === 0) return null;

  const prop = (name: string) => root.find(`[itemprop="${name}"]`);
  const content = (name: string): string | undefined => {
    const el = prop(name).first();
    return el.attr('content') ?? el.attr('datetime') ?? (squash(el.text()) || undefined);
  };

  const steps: string[] = [];
  prop('recipeInstructions').each((_, el) => {
    const items = $(el).find('li');
    if (items.length > 0) items.each((__, li) => void steps.push(...stringToSteps($(li).html() ?? '')));
    else steps.push(...stringToSteps($(el).html() ?? ''));
  });

  return {
    title: text(content('name')),
    ingredients: [...prop('recipeIngredient').toArray(), ...prop('ingredients').toArray()]
      .map((el) => text($(el).html()))
      .filter(Boolean),
    steps,
    servings: formatYield(content('recipeYield')),
    prepTime: formatDuration(content('prepTime')),
    cookTime: formatDuration(content('cookTime')),
    totalTime: formatDuration(content('totalTime')),
    image: firstImage(prop('image').first().attr('src') ?? prop('image').first().attr('content'), base),
  };
}

// ---------------------------------------------------------------------------
// Fallback: read the visible page under "Ingredients" / "Directions" headings
// ---------------------------------------------------------------------------

type Sel = cheerio.Cheerio<any>;

const HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
const INGREDIENTS_HEADING = /^(?:the\s+)?ingredients?(?:\s+list)?$/i;
const STEPS_HEADING = /^(?:directions?|instructions?|method|preparation|steps?|how to make(?:\s+it)?)$/i;

function headingLevel($el: Sel): number {
  const name = ($el.get(0) as { name?: string } | undefined)?.name ?? '';
  return Number(name.slice(1)) || 6;
}

/** Drop a leading "1." / "Step 2:" from a line of text. */
function stripNumbering(s: string): string {
  return s.replace(/^(?:step\s*)?\d+\s*[.):]\s+/i, '');
}

/**
 * The list belonging to a heading: the list items (or, failing that, the
 * paragraphs) that follow it, up to the next heading of the same or higher
 * level. If the heading is wrapped in a container with nothing after it, the
 * search moves up a level, a few times.
 */
function itemsAfterHeading($: cheerio.CheerioAPI, heading: Sel): string[] {
  const sameOrHigher = HEADINGS.slice(0, headingLevel(heading)).join(',');
  let node: Sel = heading;

  for (let climb = 0; climb < 3; climb++) {
    const listItems: string[] = [];
    const paragraphs: string[] = [];

    for (const sibling of node.nextAll().toArray()) {
      const $sibling = $(sibling);
      if ($sibling.is(sameOrHigher) || $sibling.find(sameOrHigher).length > 0) break;

      const items = $sibling.is('li') ? $sibling : $sibling.find('li');
      items.each((_, li) => {
        const $li = $(li);
        if ($li.find('li').length === 0) listItems.push(stripNumbering(cleanLine($li.html() ?? '')));
      });
      const paras = $sibling.is('p') ? $sibling : $sibling.find('p');
      paras.each((_, p) => void paragraphs.push(stripNumbering(cleanLine($(p).html() ?? ''))));
    }

    const lists = listItems.filter(Boolean);
    if (lists.length > 0) return lists;
    // Paragraph-style recipes. Short lines ending in ":" are sub-headings ("Brine:"), not steps.
    const prose = paragraphs.filter((p) => p && !(p.endsWith(':') && p.length < 60));
    if (prose.length > 0) return prose;

    node = node.parent();
    if (node.length === 0 || node.is('body, html')) break;
  }
  return [];
}

/** Items under the first heading whose text matches (sub-section labels such as "Brine:" are not kept). */
function listUnderHeading($: cheerio.CheerioAPI, matcher: RegExp): string[] {
  for (const el of $(HEADINGS.join(',')).toArray()) {
    const $heading = $(el);
    if (!matcher.test(squash($heading.text()).replace(/:$/, '').trim())) continue;
    const found = itemsAfterHeading($, $heading);
    if (found.length > 0) return found;
  }
  return [];
}

/** "Perfect Chicken Piccata Recipe | Chef Joshua Weissman" -> "Perfect Chicken Piccata Recipe". */
function pageTitle($: cheerio.CheerioAPI): string {
  const raw = $('meta[property="og:title"]').attr('content') ?? $('title').first().text();
  return squash(raw).split(/\s+[|–—-]\s+/)[0];
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Pull just the recipe out of a web page. Recipe sites embed the recipe as
 * structured data for search engines; reading that gives us the title,
 * ingredients and steps without the life story, ads and comments around them.
 *
 * If the page has no structured data (or only a stub without ingredients or
 * steps), the ingredients and steps are read from the lists under the page's
 * "Ingredients" and "Directions" headings instead. Whatever details the
 * structured data does have (title, image, times) are still used.
 */
export function extractRecipe(html: string, sourceUrl?: string): RecipeDraft {
  const $ = cheerio.load(html);
  // A stub in one format (say JSON-LD with no ingredients) shouldn't hide a complete recipe in another.
  const found = [fromJsonLd($, sourceUrl), fromMicrodata($, sourceUrl)];
  const structured =
    found.find((r) => r && r.ingredients.length > 0 && r.steps.length > 0) ?? found.find((r) => r) ?? null;

  const ingredientLines = structured?.ingredients.length
    ? structured.ingredients
    : listUnderHeading($, INGREDIENTS_HEADING);
  const stepLines = structured?.steps.length ? structured.steps : listUnderHeading($, STEPS_HEADING);
  if (ingredientLines.length === 0 || stepLines.length === 0) throw new NoRecipeError();

  const ingredients = ingredientLines.map((t) => ({ id: randomUUID(), text: t, checked: false }));
  const steps = stepLines.map((t) => ({
    id: randomUUID(),
    text: t,
    ingredientIds: linkIngredientsToStep(t, ingredients),
  }));

  return {
    title: structured?.title || pageTitle($) || 'Untitled recipe',
    sourceUrl,
    image: structured?.image ?? firstImage($('meta[property="og:image"]').attr('content'), sourceUrl),
    servings: structured?.servings,
    prepTime: structured?.prepTime,
    cookTime: structured?.cookTime,
    totalTime: structured?.totalTime,
    ingredients,
    steps,
  };
}
