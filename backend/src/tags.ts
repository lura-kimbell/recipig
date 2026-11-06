/**
 * Main-ingredient tags. A fixed list for now; the order here is the order
 * tags are stored and shown in.
 */
export const RECIPE_TAGS = ['Poultry', 'Turkey', 'Duck', 'Beef', 'Pork', 'Fish', 'Shellfish', 'Vegetarian'] as const;

export type RecipeTag = (typeof RECIPE_TAGS)[number];

/** Tags that have been renamed: until October 2026 Poultry was "Chicken". */
const RENAMED: Record<string, RecipeTag> = { chicken: 'Poultry' };

/** "poultry" -> "Poultry", and an old name to its new one; undefined for anything that isn't a known tag. */
export function canonicalTag(value: string): RecipeTag | undefined {
  const lower = value.trim().toLowerCase();
  return RECIPE_TAGS.find((t) => t.toLowerCase() === lower) ?? RENAMED[lower];
}

// Words that make a dish one of the meat or fish tags. Broths, stocks and fish
// sauce are left out on purpose: a splash of chicken stock doesn't make a
// risotto a chicken dish, nor do anchovies in a dressing make a salad a fish
// dish (both do stop it being vegetarian, see MEAT below). Turkey and duck have
// their own tags (since November 2026); Poultry is chicken and the other birds.
const NOT_A_MAIN = String.raw`(?![\s-]*(?:stock|broth|bouillon|base|fat|schmaltz|sauce|eggs?))`;
const MAIN: [RecipeTag, RegExp][] = [
  [
    'Poultry',
    new RegExp(
      String.raw`\b(?:chickens?|goose|geese|quails?|pheasants?|partridges?|poussins?|(?:cornish|game)[\s-]+hens?|guinea[\s-]?fowl)\b` + NOT_A_MAIN,
      'i',
    ),
  ],
  ['Turkey', new RegExp(String.raw`\bturkeys?\b` + NOT_A_MAIN, 'i')],
  ['Duck', new RegExp(String.raw`\b(?:ducks?|ducklings?)\b` + NOT_A_MAIN, 'i')],
  [
    'Beef',
    /\b(?:beef(?![\s-]*(?:stock|broth|bouillon|base))|veal|brisket|sirloin|rib[\s-]?eyes?|short[\s-]ribs?|oxtail|chuck|tri[\s-]?tip|(?<!(?:salmon|tuna|swordfish|halibut|cauliflower|cabbage|ham|fish)\s)steaks?)\b/i,
  ],
  // Turkey bacon and turkey ham are turkey, not pork.
  ['Pork', /\b(?:pork|(?<!turkey\s)(?:bacon|ham|hams)|prosciutto|pancetta|guanciale|chorizo|salami|pepperoni|carnitas)\b/i],
  [
    'Fish',
    /\b(?:fish(?![\s-]*sauce)|salmon|tuna|cod|halibut|tilapia|trout|haddock|mackerel|sardines?|sea bass|snapper|swordfish|mahi[\s-]?mahi|catfish|pollock|seafood)\b/i,
  ],
  // Shrimp paste, dried shrimp, oyster sauce and clam juice season a dish like fish sauce does.
  [
    'Shellfish',
    /\b(?:shellfish|(?<!dried\s)shrimps?(?![\s-]*paste)|prawns?|scallops?|crabs?|crabmeat|lobsters?|langoustines?|crayfish|crawfish|mussels?|clams?(?![\s-]*juice)|oysters?(?![\s-]*sauce)|squid|calamari|octopus(?:es)?)\b/i,
  ],
];

/** Anything that makes a recipe not vegetarian, including the small amounts MAIN ignores. */
const MEAT =
  /\b(?:chicken|beef|veal|pork|bacon|ham|prosciutto|pancetta|guanciale|chorizo|salami|pepperoni|sausages?|lamb|mutton|turkey|duck|duckling|goose|quail|pheasant|partridge|poussin|venison|bison|rabbit|steaks?|brisket|lard|gelatin|gelatine|meat|fish|salmon|tuna|cod|anchov(?:y|ies)|sardines?|shellfish|shrimps?|prawns?|crabs?|crabmeat|lobsters?|langoustines?|crayfish|crawfish|scallops?|mussels?|clams?|oysters?|squid|octopus|calamari|seafood)\b/i;

/** A recipe whose title says it is vegetarian is taken at its word ("Vegan Chicken Nuggets"). */
const VEGETARIAN_TITLE = /\b(?:vegan|vegetarian|veggie|meatless|meat[\s-]free|plant[\s-]based)\b/i;

// "Vegetable broth", "meatless crumbles" and "cauliflower steaks" are fine; strip them before looking for meat.
const VEGETARIAN_PHRASES = /\b(?:cauliflower|cabbage|mushroom|portobello|tofu|eggplant|celeriac)\s+steaks?\b|\b(?:vegetable|veggie|mushroom)\s+(?:stock|broth|bouillon)\b|\b(?:duck|quail|goose)\s+eggs?\b|\b(?:vegan|vegetarian|meatless|plant[\s-]based|meat[\s-]free)\s+\w+/gi;

const mains = (text: string): RecipeTag[] => MAIN.filter(([, re]) => re.test(text)).map(([tag]) => tag);

/**
 * Guess main-ingredient tags for an imported recipe. A meat or fish named in
 * the title wins (a chicken dish with a bit of bacon is a poultry dish);
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

/**
 * For a recipe saved before Turkey, Duck and Shellfish were tags (November 2026): moves
 * the recipe onto the new tags where detectTags finds them. Only Poultry and Fish are
 * touched, so the cook's other choices stay; Poultry is kept when chicken or another bird
 * is there too, and Fish when there is fish as well as shellfish. Used by scripts/retag.ts.
 */
export function splitOldTags(tags: readonly string[], title: string, ingredients: string[]): RecipeTag[] {
  const known = new Set(tags.map((t) => canonicalTag(t)).filter((t) => t !== undefined));
  const guess = new Set(detectTags(title, ingredients));
  if (known.has('Poultry') && (guess.has('Turkey') || guess.has('Duck'))) {
    if (guess.has('Turkey')) known.add('Turkey');
    if (guess.has('Duck')) known.add('Duck');
    if (!guess.has('Poultry')) known.delete('Poultry');
  }
  if (known.has('Fish') && guess.has('Shellfish')) {
    known.add('Shellfish');
    if (!guess.has('Fish')) known.delete('Fish');
  }
  return RECIPE_TAGS.filter((t) => known.has(t));
}
