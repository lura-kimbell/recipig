export interface Ingredient {
  id: string;
  text: string;
  /** Marked as purchased. */
  checked: boolean;
}

export interface Step {
  id: string;
  text: string;
  /** Ingredients this step refers to, shown in its expandable section. */
  ingredientIds: string[];
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
