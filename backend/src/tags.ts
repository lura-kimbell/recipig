/**
 * Main-ingredient tags. A fixed list for now; the order here is the order
 * tags are stored and shown in.
 */
export const RECIPE_TAGS = ['Chicken', 'Beef', 'Pork', 'Fish', 'Vegetarian'] as const;

export type RecipeTag = (typeof RECIPE_TAGS)[number];

/** "chicken" -> "Chicken"; undefined for anything that isn't a known tag. */
export function canonicalTag(value: string): RecipeTag | undefined {
  const lower = value.trim().toLowerCase();
  return RECIPE_TAGS.find((t) => t.toLowerCase() === lower);
}

// Words that make a dish one of the meat or fish tags. Broths, stocks and fish
// sauce are left out on purpose: a splash of chicken stock doesn't make a
// risotto a chicken dish, nor do anchovies in a dressing make a salad a fish
// dish (both do stop it being vegetarian, see MEAT below).
const MAIN: [RecipeTag, RegExp][] = [
  ['Chicken', /\bchickens?\b(?![\s-]*(?:stock|broth|bouillon|base|fat|schmaltz))/i],
  [
    'Beef',
    /\b(?:beef(?![\s-]*(?:stock|broth|bouillon|base))|veal|brisket|sirloin|rib[\s-]?eyes?|short[\s-]ribs?|oxtail|chuck|tri[\s-]?tip|(?<!(?:salmon|tuna|swordfish|halibut|cauliflower|cabbage|ham|fish)\s)steaks?)\b/i,
  ],
  ['Pork', /\b(?:pork|bacon|ham|hams|prosciutto|pancetta|guanciale|chorizo|salami|pepperoni|carnitas)\b/i],
  [
    'Fish',
    /\b(?:fish(?![\s-]*sauce)|salmon|tuna|cod|halibut|tilapia|trout|haddock|mackerel|sardines?|sea bass|snapper|swordfish|mahi[\s-]?mahi|catfish|pollock|shrimps?|prawns?|scallops?|crab|lobsters?|mussels?|clams?|seafood)\b/i,
  ],
];

/** Anything that makes a recipe not vegetarian, including the small amounts MAIN ignores. */
const MEAT =
  /\b(?:chicken|beef|veal|pork|bacon|ham|prosciutto|pancetta|guanciale|chorizo|salami|pepperoni|sausages?|lamb|mutton|turkey|duck|goose|venison|bison|rabbit|steaks?|brisket|lard|gelatin|gelatine|meat|fish|salmon|tuna|cod|anchov(?:y|ies)|sardines?|shrimps?|prawns?|crab|lobsters?|scallops?|mussels?|clams?|oysters?|squid|octopus|calamari|seafood)\b/i;

/** A recipe whose title says it is vegetarian is taken at its word ("Vegan Chicken Nuggets"). */
const VEGETARIAN_TITLE = /\b(?:vegan|vegetarian|veggie|meatless|meat[\s-]free|plant[\s-]based)\b/i;

// "Vegetable broth", "meatless crumbles" and "cauliflower steaks" are fine; strip them before looking for meat.
const VEGETARIAN_PHRASES = /\b(?:cauliflower|cabbage|mushroom|portobello|tofu|eggplant|celeriac)\s+steaks?\b|\b(?:vegetable|veggie|mushroom)\s+(?:stock|broth|bouillon)\b|\b(?:vegan|vegetarian|meatless|plant[\s-]based|meat[\s-]free)\s+\w+/gi;

const mains = (text: string): RecipeTag[] => MAIN.filter(([, re]) => re.test(text)).map(([tag]) => tag);

/**
 * Guess main-ingredient tags for an imported recipe. A meat or fish named in
 * the title wins (a chicken dish with a bit of bacon is a chicken dish);
 * otherwise the ingredient list decides. A recipe with no meat or fish
 * anywhere is tagged Vegetarian. The user can correct the result in the editor.
 */
export function detectTags(title: string, ingredients: string[]): RecipeTag[] {
  if (VEGETARIAN_TITLE.test(title)) return ['Vegetarian'];

  const fromTitle = mains(title);
  if (fromTitle.length > 0) return fromTitle;

  const fromIngredients = mains(ingredients.join('\n'));
  if (fromIngredients.length > 0) return fromIngredients;

  const everything = [title, ...ingredients].join('\n').replace(VEGETARIAN_PHRASES, ' ');
  return ingredients.length > 0 && !MEAT.test(everything) ? ['Vegetarian'] : [];
}
