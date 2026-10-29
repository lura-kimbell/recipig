import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRecipeInput, ValidationError } from '../src/validate.ts';

test('requires a title', () => {
  assert.throws(() => parseRecipeInput({ title: '   ' }), ValidationError);
  assert.throws(() => parseRecipeInput(null), ValidationError);
});

test('drops blank items, fills ids and keeps checked state', () => {
  const r = parseRecipeInput({
    title: ' Pancakes ',
    ingredients: [
      { id: 'a', text: ' 2 eggs ', checked: true },
      { text: '1 cup flour' },
      { id: 'b', text: '   ' },
    ],
    steps: [{ text: 'Mix.', ingredientIds: ['a'] }, { text: '' }],
  });
  assert.equal(r.title, 'Pancakes');
  assert.equal(r.ingredients.length, 2);
  assert.deepEqual(r.ingredients[0], { id: 'a', text: '2 eggs', checked: true });
  assert.equal(r.ingredients[1].checked, false);
  assert.ok(r.ingredients[1].id.length > 0);
  assert.equal(r.steps.length, 1);
  assert.deepEqual(r.steps[0].ingredientIds, ['a']);
});

test('removes step links to ingredients that do not exist and de-duplicates ids', () => {
  const r = parseRecipeInput({
    title: 'T',
    ingredients: [
      { id: 'same', text: 'a' },
      { id: 'same', text: 'b' },
    ],
    steps: [{ text: 'x', ingredientIds: ['same', 'same', 'ghost'] }],
  });
  assert.notEqual(r.ingredients[0].id, r.ingredients[1].id);
  assert.deepEqual(r.steps[0].ingredientIds, ['same']);
});

test('only accepts http(s) URLs for the source and image', () => {
  assert.throws(() => parseRecipeInput({ title: 'T', sourceUrl: 'javascript:alert(1)' }), ValidationError);
  assert.throws(() => parseRecipeInput({ title: 'T', image: 'not a url' }), ValidationError);
  const r = parseRecipeInput({ title: 'T', sourceUrl: 'https://example.com/r' });
  assert.equal(r.sourceUrl, 'https://example.com/r');
});

test('keeps a written source such as a cookbook, trimmed', () => {
  const r = parseRecipeInput({ title: 'T', source: '  Simple by Ottolenghi, p. 112 ' });
  assert.equal(r.source, 'Simple by Ottolenghi, p. 112');
  assert.equal(parseRecipeInput({ title: 'T', source: ' ' }).source, undefined);
  assert.throws(() => parseRecipeInput({ title: 'T', source: 'x'.repeat(301) }), ValidationError);
});

test('turns empty optional fields into undefined', () => {
  const r = parseRecipeInput({ title: 'T', servings: '  ', prepTime: '10 min' });
  assert.equal(r.servings, undefined);
  assert.equal(r.prepTime, '10 min');
});

test('keeps section labels (trimmed) and leaves out empty ones', () => {
  const r = parseRecipeInput({
    title: 'T',
    ingredients: [
      { id: 'a', text: 'x', section: ' Brine ' },
      { id: 'b', text: 'y', section: '   ' },
    ],
    steps: [{ text: 's', section: 'Sauce' }],
  });
  assert.equal(r.ingredients[0].section, 'Brine');
  assert.equal('section' in r.ingredients[1], false);
  assert.equal(r.steps[0].section, 'Sauce');
});

test('rejects a section label that is not text', () => {
  assert.throws(() => parseRecipeInput({ title: 'T', ingredients: [{ text: 'x', section: 5 }] }), ValidationError);
});

test('keeps known tags in the standard order, and none means undefined', () => {
  assert.deepEqual(parseRecipeInput({ title: 'T', tags: ['fish', 'Chicken', 'chicken'] }).tags, ['Chicken', 'Fish']);
  assert.equal(parseRecipeInput({ title: 'T', tags: [] }).tags, undefined);
  assert.equal(parseRecipeInput({ title: 'T' }).tags, undefined);
});

test('rejects unknown tags', () => {
  assert.throws(() => parseRecipeInput({ title: 'T', tags: ['Lamb'] }), ValidationError);
  assert.throws(() => parseRecipeInput({ title: 'T', tags: 'Chicken' }), ValidationError);
});

test('keeps recipe notes (trimmed, line breaks and all), and steps no longer carry notes', () => {
  const r = parseRecipeInput({ title: 'T', notes: '  Use less salt.\nTry 375F next time.  ', steps: [{ text: 'a', notes: 'x' }] });
  assert.equal(r.notes, 'Use less salt.\nTry 375F next time.');
  assert.equal('notes' in r.steps[0], false);
  assert.equal(parseRecipeInput({ title: 'T', notes: '   ' }).notes, undefined);
  assert.throws(() => parseRecipeInput({ title: 'T', notes: 5 }), ValidationError);
});
