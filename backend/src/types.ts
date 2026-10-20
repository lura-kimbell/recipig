export interface Ingredient {
  id: string;
  /** The full ingredient line, e.g. "2 large eggs". */
  text: string;
  /** Whether the user has marked this ingredient as purchased. */
  checked: boolean;
  /** Optional group label such as "Brine" or "For the sauce". */
  section?: string;
}

export interface Step {
  id: string;
  text: string;
  /** Ingredients (by id) this step refers to; shown in the step's expandable section. */
  ingredientIds: string[];
  /** Optional group label such as "Brine" or "For the sauce". */
  section?: string;
}

export interface Recipe {
  id: string;
  title: string;
  sourceUrl?: string;
  image?: string;
  servings?: string;
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  ingredients: Ingredient[];
  steps: Step[];
  createdAt: string;
  updatedAt: string;
}

/** A recipe's content, without server-managed fields. */
export type RecipeDraft = Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>;
