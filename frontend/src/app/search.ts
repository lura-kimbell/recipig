/**
 * Search over the recipe list: recipes whose name matches come first, then recipes that
 * only match on an ingredient (with the ingredient lines that matched, to show why).
 *
 * Every word of the query has to match, at the start of a word ("ham" finds "ham hock" but
 * not "graham crackers"), ignoring case and accents ("jalapeno" finds "jalapeño"). Plurals
 * meet in the middle: "tomatoes" finds "tomato" and "berry" finds "berries". For an
 * ingredient match the words may be spread over several lines, so "lime cilantro" finds a
 * recipe with both.
 *
 * Keep this file free of imports and of TypeScript-only syntax such as enums, so the tests
 * can run it with plain Node.
 */

export interface Searchable {
  title: string;
  ingredients: { text: string }[];
}

export interface IngredientMatch<T> {
  recipe: T;
  /** The ingredient lines that matched, in recipe order. */
  lines: string[];
}

export interface SearchResults<T> {
  byName: T[];
  byIngredient: IngredientMatch<T>[];
}

/** Lower case, accents removed, runs of space and punctuation squashed to one space. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** "tomatoes" -> "tomato", "berries" / "berry" -> "berr", "eggs" -> "egg". */
function stem(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith('ies')) return word.slice(0, -3);
  if (word.endsWith('oes') || word.endsWith('ches') || word.endsWith('shes')) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  if (word.endsWith('y') && word.length > 4) return word.slice(0, -1);
  return word;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A test for one query word: its stem at the start of a word. */
function wordMatcher(word: string): RegExp {
  return new RegExp(`(?:^| )${escapeRe(stem(word))}`);
}

/** Null when the query is blank (nothing to search for). */
export function searchRecipes<T extends Searchable>(recipes: readonly T[], query: string): SearchResults<T> | null {
  const words = normalize(query).split(' ').filter(Boolean);
  if (words.length === 0) return null;
  const matchers = words.map(wordMatcher);

  const byName: T[] = [];
  const byIngredient: IngredientMatch<T>[] = [];
  for (const recipe of recipes) {
    const title = normalize(recipe.title);
    if (matchers.every((m) => m.test(title))) {
      byName.push(recipe);
      continue;
    }
    const lines = recipe.ingredients.map((i) => ({ text: i.text, plain: normalize(i.text) }));
    if (!matchers.every((m) => lines.some((l) => m.test(l.plain)))) continue;
    byIngredient.push({ recipe, lines: lines.filter((l) => matchers.some((m) => m.test(l.plain))).map((l) => l.text) });
  }
  return { byName, byIngredient };
}
