import assert from 'node:assert/strict';
import test from 'node:test';
import { normalize, searchRecipes } from './search.ts';

const recipe = (title: string, ...ingredients: string[]) => ({ title, ingredients: ingredients.map((text) => ({ text })) });

const RECIPES = [
  recipe('Lemon Chicken Piccata', '4 chicken breasts', '2 lemons', '2 tbsp capers'),
  recipe('Chicken Tortilla Soup', '1 lb chicken thighs', '1 jalapeño, minced', '6 corn tortillas'),
  recipe('Cowboy Caviar', '1 can black beans', '2 limes, juiced', '1/2 cup cilantro', '1 jalapeño'),
  recipe('Graham Cracker Crust', '1 1/2 cups graham cracker crumbs', '6 tbsp butter'),
  recipe('Split Pea Soup', '1 smoked ham hock', '1 lb split peas'),
  recipe('Berry Crumble', '3 cups mixed berries', '1 cup oats'),
  recipe('Caprese Salad', '3 tomatoes', 'fresh mozzarella'),
];

const names = (r: ReturnType<typeof searchRecipes<(typeof RECIPES)[number]>>) => ({
  byName: r?.byName.map((x) => x.title),
  byIngredient: r?.byIngredient.map((x) => [x.recipe.title, ...x.lines]),
});

test('a blank query is not a search', () => {
  assert.equal(searchRecipes(RECIPES, ''), null);
  assert.equal(searchRecipes(RECIPES, '   ,  '), null);
});

test('name matches come first, then ingredient matches, never both', () => {
  assert.deepEqual(names(searchRecipes(RECIPES, 'chicken')), {
    byName: ['Lemon Chicken Piccata', 'Chicken Tortilla Soup'],
    byIngredient: [],
  });
  assert.deepEqual(names(searchRecipes(RECIPES, 'jalapeno')), {
    byName: [],
    byIngredient: [
      ['Chicken Tortilla Soup', '1 jalapeño, minced'],
      ['Cowboy Caviar', '1 jalapeño'],
    ],
  });
  assert.deepEqual(names(searchRecipes(RECIPES, 'soup')), { byName: ['Chicken Tortilla Soup', 'Split Pea Soup'], byIngredient: [] });
});

test('case and accents are ignored', () => {
  assert.deepEqual(names(searchRecipes(RECIPES, 'CAPERS')).byIngredient, [['Lemon Chicken Piccata', '2 tbsp capers']]);
  assert.equal(normalize('Jalapeño, Crème Brûlée!'), 'jalapeno creme brulee');
});

test('words match at the start of a word only', () => {
  assert.deepEqual(names(searchRecipes(RECIPES, 'ham')), {
    byName: [],
    byIngredient: [['Split Pea Soup', '1 smoked ham hock']],
  });
});

test('singular and plural find each other', () => {
  assert.deepEqual(names(searchRecipes(RECIPES, 'tomato')).byIngredient, [['Caprese Salad', '3 tomatoes']]);
  assert.deepEqual(names(searchRecipes(RECIPES, 'lime')).byIngredient, [['Cowboy Caviar', '2 limes, juiced']]);
  assert.deepEqual(names(searchRecipes(RECIPES, 'berries')).byName, ['Berry Crumble']);
  assert.deepEqual(names(searchRecipes(RECIPES, 'tortilla')), {
    byName: ['Chicken Tortilla Soup'],
    byIngredient: [],
  });
});

test('every word must match; for ingredients they may be on different lines', () => {
  assert.deepEqual(names(searchRecipes(RECIPES, 'lime cilantro')), {
    byName: [],
    byIngredient: [['Cowboy Caviar', '2 limes, juiced', '1/2 cup cilantro']],
  });
  assert.deepEqual(names(searchRecipes(RECIPES, 'chicken soup')).byName, ['Chicken Tortilla Soup']);
  assert.deepEqual(names(searchRecipes(RECIPES, 'lime butter')), { byName: [], byIngredient: [] });
});
