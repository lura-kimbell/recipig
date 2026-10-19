import assert from 'node:assert/strict';
import test from 'node:test';
import { ingredientKeywords, linkIngredientsToStep, singularize } from '../src/link.ts';

const ings = (...texts: string[]) => texts.map((text, i) => ({ id: `i${i}`, text }));

test('ingredientKeywords keeps only the words that name the ingredient', () => {
  assert.deepEqual(ingredientKeywords('2 large eggs'), ['egg']);
  assert.deepEqual(ingredientKeywords('3/4 cup sharp cheddar cheese, shredded'), ['sharp', 'cheddar', 'cheese']);
  assert.deepEqual(ingredientKeywords('1 (14 oz) can diced tomatoes'), ['tomato']);
  assert.deepEqual(ingredientKeywords('2 cloves garlic, minced'), ['garlic']);
});

test('singularize is consistent for common plurals', () => {
  assert.equal(singularize('eggs'), 'egg');
  assert.equal(singularize('tomatoes'), 'tomato');
  assert.equal(singularize('berries'), 'berry');
  assert.equal(singularize('glass'), 'glass');
});

test('links the ingredients a step mentions (the eggs-and-cheese example)', () => {
  const list = ings('2 large eggs', '3/4 cup sharp cheddar cheese, shredded', '1 tbsp butter');
  assert.deepEqual(linkIngredientsToStep('Mix the eggs with the cheese.', list), ['i0', 'i1']);
});

test('matches singular steps against plural ingredients and vice versa', () => {
  const list = ings('2 tomatoes', '1 onion');
  assert.deepEqual(linkIngredientsToStep('Chop the tomato.', list), ['i0']);
  assert.deepEqual(linkIngredientsToStep('Slice the onions thinly.', list), ['i1']);
});

test('prefers the more specific ingredient when several share a head noun', () => {
  const list = ings('2 tbsp olive oil', '1 cup vegetable oil');
  assert.deepEqual(linkIngredientsToStep('Heat the olive oil in a pan.', list), ['i0']);
  assert.deepEqual(linkIngredientsToStep('Add the oil.', list), ['i0', 'i1']);
});

test('returns nothing when no ingredient is mentioned', () => {
  const list = ings('2 large eggs', '1 tbsp butter');
  assert.deepEqual(linkIngredientsToStep('Preheat the oven to 350 degrees.', list), []);
});

test('ignores ingredient lines with no usable words', () => {
  assert.deepEqual(linkIngredientsToStep('Stir well.', ings('1 cup', '')), []);
});
