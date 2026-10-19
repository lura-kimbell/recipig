import assert from 'node:assert/strict';
import test from 'node:test';
import { extractRecipe, NoRecipeError } from '../src/extract.ts';
import { BLOG_PAGE, MICRODATA_PAGE, NO_RECIPE_PAGE, SECTIONED_PAGE, STRING_INSTRUCTIONS_PAGE } from './fixtures.ts';

test('extracts only the recipe from a blog page (JSON-LD @graph)', () => {
  const r = extractRecipe(BLOG_PAGE, 'https://blog.example.com/scramble');
  assert.equal(r.title, 'Cheesy Scrambled Eggs');
  assert.equal(r.sourceUrl, 'https://blog.example.com/scramble');
  assert.equal(r.image, 'https://cdn.example.com/eggs.jpg');
  assert.equal(r.servings, '2 servings');
  assert.equal(r.prepTime, '5 min');
  assert.equal(r.cookTime, '10 min');
  assert.equal(r.totalTime, '1 hr 15 min');
  assert.deepEqual(
    r.ingredients.map((i) => i.text),
    ['2 large eggs', '3/4 cup sharp cheddar cheese, shredded', '1 tbsp butter', 'Salt & pepper'],
  );
  assert.ok(r.ingredients.every((i) => i.checked === false));
  assert.deepEqual(
    r.steps.map((s) => s.text),
    ['Melt the butter in a pan.', 'Mix the eggs with the cheese.', 'Cook gently, stirring, until set.'],
  );
  // None of the blog's story, ads or comments leak in.
  const everything = JSON.stringify(r);
  assert.ok(!everything.includes('grandmother'));
  assert.ok(!everything.includes('cookbook'));
  assert.ok(!everything.includes('Karen'));
});

test('links each step to the ingredients it mentions', () => {
  const r = extractRecipe(BLOG_PAGE);
  const textOf = (ids: string[]) => ids.map((id) => r.ingredients.find((i) => i.id === id)?.text);
  assert.deepEqual(textOf(r.steps[0].ingredientIds), ['1 tbsp butter']);
  assert.deepEqual(textOf(r.steps[1].ingredientIds), ['2 large eggs', '3/4 cup sharp cheddar cheese, shredded']);
  assert.deepEqual(r.steps[2].ingredientIds, []);
});

test('flattens HowToSections, strips numbering, formats numeric yield', () => {
  const r = extractRecipe(SECTIONED_PAGE);
  assert.deepEqual(r.steps.map((s) => s.text), ['Drain and rinse the beans.', 'Mash the beans.', 'Spread the salsa over the beans.']);
  assert.equal(r.servings, '8 servings');
});

test('splits a single instruction string into steps', () => {
  const r = extractRecipe(STRING_INSTRUCTIONS_PAGE);
  assert.deepEqual(r.steps.map((s) => s.text), ['Toast the bread.', 'Butter the bread.', 'Serve warm.']);
  assert.equal(r.totalTime, '45 min');
  assert.equal(r.servings, '1 serving');
});

test('falls back to microdata', () => {
  const r = extractRecipe(MICRODATA_PAGE);
  assert.equal(r.title, 'Garlic Bread');
  assert.equal(r.totalTime, '20 min');
  assert.deepEqual(r.ingredients.map((i) => i.text), ['1 loaf bread', '3 cloves garlic, minced']);
  assert.deepEqual(r.steps.map((s) => s.text), ['Mix the garlic with butter.', 'Spread on the bread and bake.']);
  assert.equal(r.steps[0].ingredientIds.length, 1);
});

test('throws NoRecipeError when the page has no recipe', () => {
  assert.throws(() => extractRecipe(NO_RECIPE_PAGE), NoRecipeError);
});

test('survives broken JSON-LD blocks and finds a later good one', () => {
  const html = `<script type="application/ld+json">{ not json</script>${BLOG_PAGE}`;
  assert.equal(extractRecipe(html).title, 'Cheesy Scrambled Eggs');
});
