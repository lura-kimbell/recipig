import { randomUUID } from 'node:crypto';
import { canonicalTag, RECIPE_TAGS } from './tags.ts';
import type { RecipeDraft } from './types.ts';

export class ValidationError extends Error {}

const MAX_ITEMS = 300;
const MAX_TEXT = 3000;
const MAX_SECTION = 100;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Optional trimmed string; empty becomes undefined. */
function optionalString(v: unknown, max: number, field: string): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string') throw new ValidationError(`${field} must be text.`);
  const s = v.trim();
  if (s.length > max) throw new ValidationError(`${field} is too long.`);
  return s || undefined;
}

function optionalHttpUrl(v: unknown, field: string): string | undefined {
  const s = optionalString(v, 2000, field);
  if (!s) return undefined;
  try {
    const u = new URL(s);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString();
  } catch {
    // fall through
  }
  throw new ValidationError(`${field} must be an http(s) URL.`);
}

function uniqueId(candidate: unknown, seen: Set<string>): string {
  let id = typeof candidate === 'string' && candidate.length > 0 && candidate.length <= 100 ? candidate : '';
  if (!id || seen.has(id)) id = randomUUID();
  seen.add(id);
  return id;
}

function itemList(v: unknown, field: string): unknown[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new ValidationError(`${field} must be a list.`);
  if (v.length > MAX_ITEMS) throw new ValidationError(`${field} has too many items.`);
  return v;
}

/** Known tags only, de-duplicated and in the standard order; undefined when there are none. */
function tagList(v: unknown) {
  const chosen = new Set(
    itemList(v, 'tags').map((raw) => {
      const tag = typeof raw === 'string' ? canonicalTag(raw) : undefined;
      if (!tag) throw new ValidationError(`Unknown tag. Tags are: ${RECIPE_TAGS.join(', ')}.`);
      return tag;
    }),
  );
  const tags = RECIPE_TAGS.filter((t) => chosen.has(t));
  return tags.length > 0 ? tags : undefined;
}

/**
 * Validate and normalise a recipe sent by the client. Blank ingredients and
 * steps are dropped, ids are filled in where missing, and step links to
 * ingredients that no longer exist are removed.
 */
export function parseRecipeInput(body: unknown): RecipeDraft {
  if (!isObject(body)) throw new ValidationError('Request body must be a recipe object.');

  const title = optionalString(body.title, 200, 'title');
  if (!title) throw new ValidationError('A recipe needs a title.');

  const ingredientIds = new Set<string>();
  const ingredients = itemList(body.ingredients, 'ingredients').flatMap((raw) => {
    if (!isObject(raw)) throw new ValidationError('Each ingredient must be an object.');
    const text = optionalString(raw.text, MAX_TEXT, 'ingredient text');
    if (!text) return [];
    const section = optionalString(raw.section, MAX_SECTION, 'section');
    return [{ id: uniqueId(raw.id, ingredientIds), text, checked: raw.checked === true, ...(section ? { section } : {}) }];
  });

  const stepIds = new Set<string>();
  const steps = itemList(body.steps, 'steps').flatMap((raw) => {
    if (!isObject(raw)) throw new ValidationError('Each step must be an object.');
    const text = optionalString(raw.text, MAX_TEXT, 'step text');
    if (!text) return [];
    const linked = Array.isArray(raw.ingredientIds) ? raw.ingredientIds : [];
    const links = [...new Set(linked.filter((id): id is string => typeof id === 'string' && ingredientIds.has(id)))];
    const section = optionalString(raw.section, MAX_SECTION, 'section');
    return [{ id: uniqueId(raw.id, stepIds), text, ingredientIds: links, ...(section ? { section } : {}) }];
  });

  return {
    title,
    sourceUrl: optionalHttpUrl(body.sourceUrl, 'sourceUrl'),
    source: optionalString(body.source, 300, 'source'),
    image: optionalHttpUrl(body.image, 'image'),
    servings: optionalString(body.servings, 200, 'servings'),
    prepTime: optionalString(body.prepTime, 200, 'prepTime'),
    cookTime: optionalString(body.cookTime, 200, 'cookTime'),
    totalTime: optionalString(body.totalTime, 200, 'totalTime'),
    notes: optionalString(body.notes, MAX_TEXT, 'notes'),
    tags: tagList(body.tags),
    ingredients,
    steps,
  };
}
