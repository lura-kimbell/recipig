import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalTag, detectTags } from '../src/tags.ts';

test('canonicalTag accepts any case and rejects unknown tags', () => {
  assert.equal(canonicalTag(' chicken '), 'Chicken');
  assert.equal(canonicalTag('VEGETARIAN'), 'Vegetarian');
  assert.equal(canonicalTag('Lamb'), undefined);
});

test('a meat named in the title decides the tag', () => {
  assert.deepEqual(detectTags('Chicken Piccata', ['4 chicken breasts', '2 oz pancetta', '1 lemon']), ['Chicken']);
  assert.deepEqual(detectTags('Steak Frites', ['2 strip steaks', '1 lb potatoes']), ['Beef']);
  assert.deepEqual(detectTags('Surf and Turf: Steak and Shrimp', ['2 steaks', '12 shrimp']), ['Beef', 'Fish']);
});

test('without a meat in the title, the ingredients decide', () => {
  assert.deepEqual(detectTags('Weeknight Tacos', ['1 lb ground beef', '8 tortillas']), ['Beef']);
  assert.deepEqual(detectTags('Carbonara', ['1 lb spaghetti', '4 oz guanciale', '3 eggs']), ['Pork']);
  assert.deepEqual(detectTags('Sheet Pan Dinner', ['2 salmon fillets', '1 lb asparagus']), ['Fish']);
  assert.deepEqual(detectTags('Cobb Salad', ['2 cooked chicken breasts', '6 slices bacon', 'lettuce']), ['Chicken', 'Pork']);
});

test('stock, fish sauce and anchovies are not a main ingredient, but are not vegetarian either', () => {
  assert.deepEqual(detectTags('Mushroom Risotto', ['1 cup arborio rice', '4 cups chicken stock', 'mushrooms']), []);
  assert.deepEqual(detectTags('Green Papaya Salad', ['1 green papaya', '2 tbsp fish sauce']), []);
  assert.deepEqual(detectTags('Caesar Salad', ['1 head romaine', '4 anchovy fillets', 'parmesan']), []);
  assert.deepEqual(detectTags('French Onion Soup', ['6 onions', '6 cups beef broth', 'gruyère']), []);
});

test('recipes with no meat or fish are vegetarian', () => {
  assert.deepEqual(detectTags('Lentil Soup', ['1 cup lentils', '4 cups vegetable broth', '1 carrot']), ['Vegetarian']);
  assert.deepEqual(detectTags('Beefsteak Tomato Salad', ['2 beefsteak tomatoes', 'basil', 'olive oil']), ['Vegetarian']);
  assert.deepEqual(detectTags('Cauliflower Steaks', ['1 head cauliflower', 'olive oil']), ['Vegetarian']);
  assert.deepEqual(detectTags('Lamb Stew', ['2 lb lamb shoulder', 'potatoes']), []);
});

test('a title that says vegan or vegetarian wins', () => {
  assert.deepEqual(detectTags('Vegan "Chicken" Nuggets', ['1 block tofu', 'breadcrumbs']), ['Vegetarian']);
  assert.deepEqual(detectTags('Meatless Monday Chili', ['1 can beans', '1 cup meatless crumbles']), ['Vegetarian']);
});
