import assert from 'node:assert/strict';
import test from 'node:test';
import { FOODS } from './nutrition-data.ts';
import { estimateNutrition, findFood, readIngredient, servingCount } from './nutrition.ts';

/** Grams read from a line, and the first name of the food it matched. */
function read(line: string): [string, number] | string {
  const r = readIngredient(line, FOODS);
  return r.ok ? [r.food.names[0], Math.round(r.grams)] : r.reason;
}

function check(cases: [string, [string, number] | string][]): void {
  for (const [line, expected] of cases) assert.deepEqual(read(line), expected, line);
}

test('volumes are converted with the food’s own weight per cup', () => {
  check([
    ['1 cup all-purpose flour', ['all-purpose flour', 125]],
    ['2 cups sugar', ['sugar', 400]],
    ['1 tbsp butter', ['butter', 14]],
    ['1/2 teaspoon salt', ['salt', 3]],
    ['3/4 cup sharp cheddar cheese, shredded', ['cheddar', 85]],
    ['1 ½ cups milk', ['milk', 366]],
    ['1½ cups whole milk', ['milk', 366]],
    ['250 ml heavy cream', ['heavy cream', 251]],
    ['a pinch of salt', ['salt', 0]],
  ]);
});

test('weights are taken as written', () => {
  check([
    ['1 lb ground beef', ['ground beef', 454]],
    ['200g plain flour', ['all-purpose flour', 200]],
    ['8 oz cream cheese, softened', ['cream cheese', 227]],
    ['1.5 kg pork shoulder', ['pork shoulder', 1500]],
  ]);
});

test('counted items use a typical weight for one', () => {
  check([
    ['2 large eggs', ['egg', 100]],
    ['1 medium onion, diced', ['onion', 110]],
    ['4 chicken breasts', ['chicken breast', 800]],
    ['3 cloves garlic, minced', ['garlic', 9]],
    ['4 garlic cloves', ['garlic', 12]],
    ['1 stick unsalted butter', ['unsalted butter', 113]],
    ['6 slices bacon', ['bacon', 168]],
    ['2 bay leaves', ['dried oregano', 0]],
    ['1 bunch cilantro', ['parsley', 50]],
    ['2-3 carrots', ['carrot', 153]],
  ]);
});

test('containers use the size written on them, or a typical one', () => {
  check([
    ['1 (14 oz) can diced tomatoes', ['diced tomatoes', 397]],
    ['2 x 400g tins chopped tomatoes', ['diced tomatoes', 800]],
    ['2 15-ounce cans black beans, drained', ['black beans', 851]],
    ['1 can black beans, drained and rinsed', ['black beans', 240]],
    ['1 can coconut milk', ['coconut milk', 400]],
    ['1 package cream cheese', ['cream cheese', 226]],
  ]);
});

test('the most specific food wins', () => {
  const name = (s: string) => findFood(s, FOODS)?.names[0];
  assert.equal(name('brown sugar'), 'brown sugar');
  assert.equal(name('chicken broth'), 'chicken broth');
  assert.equal(name('unsalted butter'), 'unsalted butter');
  assert.equal(name('peanut butter'), 'peanut butter');
  assert.equal(name('cream cheese'), 'cream cheese');
  assert.equal(name('sour cream'), 'sour cream');
  assert.equal(name('red pepper flakes'), 'nutmeg');
  assert.equal(name('red bell pepper'), 'bell pepper');
  assert.equal(name('green beans'), 'green beans');
  assert.equal(name('fish sauce'), 'fish sauce');
  assert.equal(name('eggplant'), 'eggplant');
  assert.equal(name('buttermilk'), 'buttermilk');
  assert.equal(name('cherry tomatoes'), 'cherry tomatoes');
});

test('lines without an amount or with an unknown food are reported, not guessed', () => {
  check([
    ['Salt & pepper', 'no amount'],
    ['salt and pepper to taste', 'no amount'],
    ['Juice of 1 lemon', 'no amount'],
    ['2 cups dragonfruit cubes', 'unknown food'],
    ['1 jar salsa verde', 'unknown unit'],
  ]);
});

test('adds up a recipe', () => {
  const r = estimateNutrition(['2 large eggs', '3/4 cup sharp cheddar cheese, shredded', '1 tbsp butter', 'Salt & pepper'], FOODS);
  assert.equal(r.counted, 3);
  assert.deepEqual(r.skipped, [{ text: 'Salt & pepper', reason: 'no amount' }]);
  // 100 g egg + 85 g cheddar (3/4 cup) + 14.2 g butter (1 tbsp).
  const cheddar = (113 * 3) / 4;
  const butter = (227 * 14.79) / 236.6;
  assert.ok(Math.abs(r.total.calories - (143 + 4.04 * cheddar + 7.17 * butter)) < 0.5);
  assert.ok(Math.abs(r.total.protein - (12.6 + 0.249 * cheddar + 0.009 * butter)) < 0.05);
});

test('servingCount reads the first number', () => {
  assert.equal(servingCount('4 servings'), 4);
  assert.equal(servingCount('Serves 4-6'), 4);
  assert.equal(servingCount('Makes 24 cookies'), 24);
  assert.equal(servingCount('a crowd'), null);
  assert.equal(servingCount(undefined), null);
});
