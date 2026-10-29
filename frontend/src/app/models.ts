/** Main-ingredient tags, in the order they are shown. Must match RECIPE_TAGS in backend/src/tags.ts. */
export const RECIPE_TAGS = ['Chicken', 'Beef', 'Pork', 'Fish', 'Vegetarian'] as const;

export type RecipeTag = (typeof RECIPE_TAGS)[number];

export interface Ingredient {
  id: string;
  text: string;
  /** Marked as purchased. */
  checked: boolean;
  /** Group label such as "Brine"; items with the same label sit together. */
  section?: string;
}

export interface Step {
  id: string;
  text: string;
  /** Ingredients this step refers to, shown in its expandable section. */
  ingredientIds: string[];
  /** Group label such as "Brine"; steps with the same label sit together. */
  section?: string;
}

export interface Recipe {
  id: string;
  title: string;
  sourceUrl?: string;
  /** Where it came from when that isn't a web page, such as a cookbook and page. */
  source?: string;
  image?: string;
  servings?: string;
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  /** The cook's own notes: tweaks they tried, ideas for next time. Omitted when blank. */
  notes?: string;
  /** Main-ingredient tags; omitted when there are none. */
  tags?: RecipeTag[];
  ingredients: Ingredient[];
  steps: Step[];
  createdAt: string;
  updatedAt: string;
}

/** A recipe's content, as sent when creating one. */
export type RecipeDraft = Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>;

export interface Group<T> {
  section?: string;
  items: T[];
}

/** Split a list into runs of items that share a section label, keeping the original order. */
export function groupBySection<T extends { section?: string }>(items: readonly T[]): Group<T>[] {
  const groups: Group<T>[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.section === item.section) last.items.push(item);
    else groups.push({ section: item.section, items: [item] });
  }
  return groups;
}
