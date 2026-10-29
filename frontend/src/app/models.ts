/** Main-ingredient tags, in the order they are shown. Must match RECIPE_TAGS in backend/src/tags.ts. */
export const RECIPE_TAGS = ['Poultry', 'Beef', 'Pork', 'Fish', 'Vegetarian'] as const;

export type RecipeTag = (typeof RECIPE_TAGS)[number];

/**
 * Icons a source can have, in the order the picker shows them: MingCute line icons in
 * public/source-icons, by file name. Must match SOURCE_ICONS in backend/src/sources.ts.
 */
export const SOURCE_ICONS = [
  { id: 'book', label: 'Book' },
  { id: 'notebook', label: 'Notebook' },
  { id: 'news', label: 'Newspaper' },
  { id: 'globe', label: 'Website' },
  { id: 'chef-hat', label: 'Chef' },
  { id: 'tv', label: 'TV' },
  { id: 'video', label: 'Video' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'pinterest', label: 'Pinterest' },
  { id: 'mail', label: 'Newsletter' },
  { id: 'home', label: 'Home' },
  { id: 'group', label: 'Family' },
  { id: 'user-heart', label: 'Friend' },
  { id: 'pen', label: 'Handwritten' },
  { id: 'heart', label: 'Heart' },
  { id: 'star', label: 'Star' },
  { id: 'bookmark', label: 'Bookmark' },
  { id: 'fork-knife', label: 'Restaurant' },
  { id: 'store', label: 'Shop' },
  { id: 'pot', label: 'Pot' },
  { id: 'cake', label: 'Cake' },
  { id: 'leaf', label: 'Leaf' },
] as const;

export type SourceIcon = (typeof SOURCE_ICONS)[number]['id'];

/** Where recipes come from (a cookbook, "NY Times"), set up once and given to many recipes. */
export interface Source {
  id: string;
  name: string;
  icon: SourceIcon;
}

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
  /** The web page it was imported from. */
  sourceUrl?: string;
  /** One of the cook's sources (see Source); omitted when it has none. */
  sourceId?: string;
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
