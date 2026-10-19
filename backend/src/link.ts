import type { Ingredient } from './types.ts';

/**
 * Words that describe quantity, preparation or size rather than naming the
 * ingredient itself. They are dropped when working out what an ingredient is
 * called, so "3/4 cup sharp cheddar cheese, shredded" boils down to
 * [sharp, cheddar, cheese].
 */
const STOP_WORDS = new Set(
  (
    'a an the and or of to for with in on at by from as plus more extra about into ' +
    'cup cups c tbsp tbsps tablespoon tablespoons tsp tsps teaspoon teaspoons ' +
    'oz ounce ounces lb lbs pound pounds g gram grams kg kilogram kilograms ' +
    'ml milliliter milliliters l liter liters litre litres quart quarts pint pints gallon gallons ' +
    'stick sticks pinch pinches dash dashes clove cloves can cans package packages packet packets ' +
    'jar jars bunch bunches handful sprig sprigs slice slices piece pieces ' +
    'large medium small big fresh freshly finely roughly coarsely thinly thickly ' +
    'chopped diced minced sliced grated shredded crushed ground softened melted room temperature ' +
    'cold warm hot divided optional taste serving garnish packed level heaping heaped whole halved ' +
    'quartered peeled seeded trimmed boneless skinless cut inch inches cubed beaten'
  ).split(' '),
);

/** Lowercased word tokens (letters only, so numbers and fractions vanish). */
export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** A deliberately naive singularizer; it only has to be consistent on both sides of a comparison. */
export function singularize(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.length > 4 && word.endsWith('oes')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** The words that name an ingredient, in order. The last one is its "head" noun. */
export function ingredientKeywords(text: string): string[] {
  const core = text
    .replace(/\([^)]*\)/g, ' ') // "(14 oz)"
    .split(',')[0]; // "garlic, minced" -> "garlic"
  return tokens(core)
    .filter((t) => !STOP_WORDS.has(t))
    .map(singularize);
}

/**
 * Work out which ingredients a step is talking about. An ingredient matches
 * when its head noun appears in the step ("the cheese" matches "sharp cheddar
 * cheese"). When several ingredients share a head noun ("olive oil" and
 * "vegetable oil"), only the best-scoring ones are kept.
 *
 * Returns ingredient ids in the order the ingredients are listed.
 */
export function linkIngredientsToStep(
  stepText: string,
  ingredients: Pick<Ingredient, 'id' | 'text'>[],
): string[] {
  const stepTokens = new Set(tokens(stepText).map(singularize));
  const groups = new Map<string, { id: string; score: number }[]>();

  for (const ing of ingredients) {
    const keywords = ingredientKeywords(ing.text);
    if (keywords.length === 0) continue;
    const head = keywords[keywords.length - 1];
    if (!stepTokens.has(head)) continue;
    const score = keywords.filter((k) => stepTokens.has(k)).length;
    const group = groups.get(head) ?? [];
    group.push({ id: ing.id, score });
    groups.set(head, group);
  }

  const keep = new Set<string>();
  for (const group of groups.values()) {
    const best = Math.max(...group.map((g) => g.score));
    for (const g of group) if (g.score === best) keep.add(g.id);
  }
  return ingredients.map((i) => i.id).filter((id) => keep.has(id));
}
