import * as cheerio from 'cheerio';
import { randomUUID } from 'node:crypto';
import { linkIngredientsToStep } from './link.ts';
import { detectTags } from './tags.ts';
import type { RecipeDraft } from './types.ts';

export class NoRecipeError extends Error {
  constructor() {
    super(
      "Couldn't find a recipe on that page. Some sites don't publish their recipe in a form that can be imported.",
    );
  }
}

/** One ingredient line or step, with the sub-heading it sat under (if any). */
interface RawItem {
  text: string;
  section?: string;
}

interface RawRecipe {
  title: string;
  ingredients: RawItem[];
  steps: RawItem[];
  servings?: string;
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  /** The recipe's own image value, as published (a URL, an ImageObject, or a list of them). */
  images?: unknown;
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

/**
 * recipeInstructions can be a string, a list of strings, HowToStep objects, or
 * HowToSections of steps. A section's name is kept as the label of its steps.
 */
function flattenInstructions(v: unknown, section?: string): RawItem[] {
  if (v == null) return [];
  if (typeof v === 'string') return stringToSteps(v).map((t) => ({ text: t, section }));
  if (Array.isArray(v)) return v.flatMap((item) => flattenInstructions(item, section));
  if (isObj(v)) {
    if (v.itemListElement != null) return flattenInstructions(v.itemListElement, text(v.name) || section);
    const t = v.text ?? v.name;
    return typeof t === 'string' ? stringToSteps(t).map((s) => ({ text: s, section })) : [];
  }
  return [];
}

const plain = (lines: string[]): RawItem[] => lines.map((t) => ({ text: t }));

/**
 * Sections only help when they actually divide the recipe. If every item has
 * the same label (a lone "Instructions" section, say) the label is noise.
 */
function dropSingleSection(items: RawItem[]): RawItem[] {
  const labels = new Set(items.map((i) => i.section));
  if (labels.size === 1 && items[0]?.section) return items.map(({ text: t }) => ({ text: t }));
  return items;
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

interface ImageCandidate {
  url: string;
  width?: number;
  height?: number;
  /** A size taken from a "-500x375" file name suffix rather than stated by the page. */
  sizedByName: boolean;
}

/** The WordPress-style size suffix: "dish-500x375.jpg" is a 500 x 375 crop of "dish.jpg". */
const SIZE_SUFFIX = /-(\d{2,5})x(\d{2,5})(\.[a-z0-9]+)$/i;

const positiveNumber = (v: unknown): number | undefined => {
  const n = Number(isObj(v) ? v['@value'] ?? v.value : v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** Every image in a published image value, made absolute, with whatever size is known. */
function imageCandidates(v: unknown, base?: string): ImageCandidate[] {
  return toArray(v).flatMap((item): ImageCandidate[] => {
    const raw = typeof item === 'string' ? item : isObj(item) ? (item.url ?? item.contentUrl) : undefined;
    if (typeof raw !== 'string') return [];
    let url: URL;
    try {
      url = new URL(raw, base);
    } catch {
      return [];
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return [];
    const width = isObj(item) ? positiveNumber(item.width) : undefined;
    const height = isObj(item) ? positiveNumber(item.height) : undefined;
    if (width && height) return [{ url: url.toString(), width, height, sizedByName: false }];
    const m = SIZE_SUFFIX.exec(url.pathname);
    return [{ url: url.toString(), width: m ? Number(m[1]) : undefined, height: m ? Number(m[2]) : undefined, sizedByName: !!m }];
  });
}

/** Which photo a URL shows, ignoring its size: "dish-225x225.jpg" and "dish.jpg" are the same photo. */
function photoKey(url: string): string {
  const u = new URL(url);
  return u.host + u.pathname.replace(SIZE_SUFFIX, '$3');
}

/** Below this width a photo looks soft across the recipe page, so the full-size original is worth more. */
const SHARP_WIDTH = 1000;

/**
 * The recipe's main photo, at the best size on offer.
 *
 * Sites list their recipe photo in several sizes and crops, smallest first more often than
 * not, and taking the first one gave 225px thumbnails that blur on the recipe page. Only the
 * recipe's own image value is looked at: schema.org and Google reserve it for the finished
 * dish, while step photos sit on the steps and are never considered. Within it, a candidate
 * must be a version of the first (listed) photo: the same file at another size, or any image
 * whose width and height the page states (how sites publish crops of the main photo). The
 * page's share image is used only when it is the same file. Among versions wide enough to
 * look sharp, the largest landscape crop wins (cards and the recipe page are wide), or the
 * largest if none is landscape; otherwise the full-size original if listed, else the largest.
 */
function pickImage(v: unknown, base?: string, sameFileOnly: unknown = undefined): string | undefined {
  const listed = imageCandidates(v, base);
  const first = listed[0];
  if (!first) return undefined;
  const key = photoKey(first.url);
  const stated = (c: ImageCandidate) => c.width !== undefined && !c.sizedByName;
  const versions = [
    ...listed.filter((c) => photoKey(c.url) === key || (stated(c) && stated(first))),
    ...imageCandidates(sameFileOnly, base).filter((c) => photoKey(c.url) === key),
  ];
  const sized = versions.filter((c) => c.width !== undefined && c.height !== undefined);
  const area = (c: ImageCandidate) => c.width! * c.height!;
  const sharp = sized.filter((c) => c.width! >= SHARP_WIDTH);
  const landscape = sharp.filter((c) => c.width! / c.height! >= 1.3);
  const pool = landscape.length > 0 ? landscape : sharp;
  if (pool.length > 0) return pool.reduce((best, c) => (area(c) > area(best) ? c : best)).url;
  const largest = sized.reduce<ImageCandidate | undefined>((best, c) => (!best || area(c) > area(best) ? c : best), undefined);
  const original = versions.find((c) => c.width === undefined && photoKey(c.url) === key);
  return original?.url ?? largest?.url ?? first.url;
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

function fromJsonLd($: cheerio.CheerioAPI): RawRecipe | null {
  let firstFound: RawRecipe | null = null;
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    const node = findRecipeNode(parseJson($(el).text()));
    if (!node) continue;
    const candidate: RawRecipe = {
      title: text(node.name),
      ingredients: plain(toArray(node.recipeIngredient ?? node.ingredients).map(text).filter(Boolean)),
      steps: flattenInstructions(node.recipeInstructions),
      servings: formatYield(node.recipeYield),
      prepTime: formatDuration(node.prepTime),
      cookTime: formatDuration(node.cookTime),
      totalTime: formatDuration(node.totalTime),
      images: node.image,
    };
    // Some sites publish a stub (title and image, but no ingredients or steps).
    // Keep looking for a complete one, and fall back to the stub for its details.
    if (candidate.ingredients.length > 0 && candidate.steps.length > 0) return candidate;
    firstFound ??= candidate;
  }
  return firstFound;
}

/** Older sites mark recipes up with schema.org microdata instead of JSON-LD. */
function fromMicrodata($: cheerio.CheerioAPI): RawRecipe | null {
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
    ingredients: plain(
      [...prop('recipeIngredient').toArray(), ...prop('ingredients').toArray()]
        .map((el) => text($(el).html()))
        .filter(Boolean),
    ),
    steps: plain(steps),
    servings: formatYield(content('recipeYield')),
    prepTime: formatDuration(content('prepTime')),
    cookTime: formatDuration(content('cookTime')),
    totalTime: formatDuration(content('totalTime')),
    images: prop('image').first().attr('src') ?? prop('image').first().attr('content'),
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

/** A short line that names a group of items ("Brine:", "For the sauce") rather than being one. */
function isSectionLabel($p: Sel): boolean {
  const t = squash($p.text());
  if (!t || t.length >= 60) return false;
  if (t.endsWith(':')) return true;
  // Everything in the paragraph is bold: <p><strong>For the sauce</strong></p>
  const kids = $p.children();
  return kids.length === 1 && kids.is('strong, b') && squash(kids.text()) === t;
}

const cleanLabel = (s: string): string => squash(s).replace(/:$/, '').trim();

/**
 * The list belonging to a heading: the list items (or, failing that, the
 * paragraphs) that follow it, up to the next heading of the same or higher
 * level. Sub-headings and bold "Brine:" style lines along the way become the
 * section label of the items after them. If the heading is wrapped in a
 * container with nothing after it, the search moves up a level, a few times.
 */
function itemsAfterHeading($: cheerio.CheerioAPI, heading: Sel): RawItem[] {
  const level = headingLevel(heading);
  const sameOrHigher = HEADINGS.slice(0, level).join(',');
  const subHeadings = HEADINGS.slice(level).join(',');
  const candidates = ['li', 'p', ...HEADINGS.slice(level)].join(',');
  let node: Sel = heading;

  for (let climb = 0; climb < 3; climb++) {
    const listItems: RawItem[] = [];
    const paragraphs: RawItem[] = [];
    let section: string | undefined;

    for (const sibling of node.nextAll().toArray()) {
      const $sibling = $(sibling);
      if ($sibling.is(sameOrHigher) || $sibling.find(sameOrHigher).length > 0) break;

      // The sibling and everything inside it, in document order, so that a label is
      // seen before the items that follow it.
      for (const el of [sibling, ...$sibling.find('*').toArray()]) {
        const $el = $(el);
        if (!$el.is(candidates)) continue;
        if (subHeadings && $el.is(subHeadings)) {
          section = cleanLabel($el.text()) || undefined;
        } else if ($el.is('li')) {
          if ($el.find('li').length > 0) continue; // a wrapper around a nested list
          const t = stripNumbering(cleanLine($el.html() ?? ''));
          if (t) listItems.push({ text: t, section });
        } else if ($el.closest('li').length === 0) {
          // A paragraph: either a label for what follows, or a step in its own right.
          if (isSectionLabel($el)) section = cleanLabel($el.text()) || undefined;
          else {
            const t = stripNumbering(cleanLine($el.html() ?? ''));
            if (t) paragraphs.push({ text: t, section });
          }
        }
      }
    }

    if (listItems.length > 0) return dropSingleSection(listItems);
    if (paragraphs.length > 0) return dropSingleSection(paragraphs);

    node = node.parent();
    if (node.length === 0 || node.is('body, html')) break;
  }
  return [];
}

/** Items under the first heading whose text matches, with their sub-section labels. */
function listUnderHeading($: cheerio.CheerioAPI, matcher: RegExp): RawItem[] {
  for (const el of $(HEADINGS.join(',')).toArray()) {
    const $heading = $(el);
    if (!matcher.test(cleanLabel($heading.text()))) continue;
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
/** The page's structured recipe: a complete one if there is one, else any stub. */
function findStructured($: cheerio.CheerioAPI): RawRecipe | null {
  // A stub in one format (say JSON-LD with no ingredients) shouldn't hide a complete recipe in another.
  const found = [fromJsonLd($), fromMicrodata($)];
  return found.find((r) => r && r.ingredients.length > 0 && r.steps.length > 0) ?? found.find((r) => r) ?? null;
}

/** The best version of the recipe's photo on a page (see pickImage). */
function bestImage($: cheerio.CheerioAPI, structured: RawRecipe | null, sourceUrl?: string): string | undefined {
  const og = $('meta[property="og:image"]').attr('content');
  return pickImage(structured?.images, sourceUrl, og) ?? pickImage(og, sourceUrl);
}

/**
 * For refreshing a saved recipe's photo: the best version of the recipe photo on its page,
 * and whether a saved image URL is that same photo or another image the page offers for the
 * recipe. Anything else is a photo the cook chose themselves and should be left alone.
 */
export function recipePhoto(html: string, sourceUrl?: string): { best?: string; offers(url: string): boolean } {
  const $ = cheerio.load(html);
  const structured = findStructured($);
  const best = bestImage($, structured, sourceUrl);
  const offered = [
    ...imageCandidates(structured?.images, sourceUrl),
    ...imageCandidates($('meta[property="og:image"]').attr('content'), sourceUrl),
  ].map((c) => c.url);
  const offers = (url: string): boolean => {
    try {
      const absolute = new URL(url, sourceUrl).toString();
      return offered.includes(absolute) || (best !== undefined && photoKey(absolute) === photoKey(best));
    } catch {
      return false;
    }
  };
  return { best, offers };
}

export function extractRecipe(html: string, sourceUrl?: string): RecipeDraft {
  const $ = cheerio.load(html);
  const structured = findStructured($);

  const ingredientItems = structured?.ingredients.length
    ? structured.ingredients
    : listUnderHeading($, INGREDIENTS_HEADING);
  const stepItems = dropSingleSection(
    structured?.steps.length ? structured.steps : listUnderHeading($, STEPS_HEADING),
  );
  if (ingredientItems.length === 0 || stepItems.length === 0) throw new NoRecipeError();

  const ingredients = ingredientItems.map((i) => ({
    id: randomUUID(),
    text: i.text,
    checked: false,
    ...(i.section ? { section: i.section } : {}),
  }));
  const steps = stepItems.map((s) => ({
    id: randomUUID(),
    text: s.text,
    ingredientIds: linkIngredientsToStep(s.text, ingredients, s.section),
    ...(s.section ? { section: s.section } : {}),
  }));

  const title = structured?.title || pageTitle($) || 'Untitled recipe';
  const tags = detectTags(title, ingredients.map((i) => i.text));

  return {
    title,
    sourceUrl,
    image: bestImage($, structured, sourceUrl),
    servings: structured?.servings,
    prepTime: structured?.prepTime,
    cookTime: structured?.cookTime,
    totalTime: structured?.totalTime,
    ...(tags.length > 0 ? { tags } : {}),
    ingredients,
    steps,
  };
}
