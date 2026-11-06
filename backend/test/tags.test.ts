import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalTag, detectTags, splitOldTags } from '../src/tags.ts';

test('canonicalTag accepts any case and rejects unknown tags', () => {
  assert.equal(canonicalTag(' poultry '), 'Poultry');
  assert.equal(canonicalTag('Chicken'), 'Poultry');
  assert.equal(canonicalTag('VEGETARIAN'), 'Vegetarian');
  assert.equal(canonicalTag('Lamb'), undefined);
});

test('a meat named in the title decides the tag', () => {
  assert.deepEqual(detectTags('Chicken Piccata', ['4 chicken breasts', '2 oz pancetta', '1 lemon']), ['Poultry']);
  assert.deepEqual(detectTags('Steak Frites', ['2 strip steaks', '1 lb potatoes']), ['Beef']);
  assert.deepEqual(detectTags('Surf and Turf: Steak and Shrimp', ['2 steaks', '12 shrimp']), ['Beef', 'Shellfish']);
});

test('without a meat in the title, the ingredients decide', () => {
  assert.deepEqual(detectTags('Weeknight Tacos', ['1 lb ground beef', '8 tortillas']), ['Beef']);
  assert.deepEqual(detectTags('Carbonara', ['1 lb spaghetti', '4 oz guanciale', '3 eggs']), ['Pork']);
  assert.deepEqual(detectTags('Sheet Pan Dinner', ['2 salmon fillets', '1 lb asparagus']), ['Fish']);
  assert.deepEqual(detectTags('Cobb Salad', ['2 cooked chicken breasts', '6 slices bacon', 'lettuce']), ['Poultry', 'Pork']);
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

test('Poultry covers chicken and other birds, not their stock, fat, sauce or eggs', () => {
  assert.deepEqual(detectTags('Christmas Goose', ['1 goose (about 5 kg)']), ['Poultry']);
  assert.deepEqual(detectTags('Weeknight Dinner', ['2 Cornish game hens', '1 lemon']), ['Poultry']);
  assert.deepEqual(detectTags('Grilled Quail', ['8 quails', 'honey']), ['Poultry']);
  assert.deepEqual(detectTags('Duck Fat Potatoes', ['1 kg potatoes', '3 tbsp duck fat']), []);
  assert.deepEqual(detectTags('Spring Rolls', ['8 rice paper wrappers', 'duck sauce, to serve', 'carrots']), []);
  assert.deepEqual(detectTags('Mushroom Risotto', ['300 g arborio rice', '1 litre turkey stock']), []);
  assert.deepEqual(detectTags('Pickled Quail Eggs', ['12 quail eggs', 'vinegar']), ['Vegetarian']);
});

test('turkey and duck have their own tags', () => {
  assert.deepEqual(detectTags('Roast Turkey Crown', ['1 turkey crown', 'butter']), ['Turkey']);
  assert.deepEqual(detectTags('Weeknight Chili', ['1 lb ground turkey', '1 can beans']), ['Turkey']);
  assert.deepEqual(detectTags('Club Sandwich', ['4 slices turkey bacon', '2 slices turkey breast', 'bread']), ['Turkey']);
  assert.deepEqual(detectTags('Crispy Duck Legs', ['4 duck legs', 'salt']), ['Duck']);
  assert.deepEqual(detectTags('Roast Duckling with Cherries', ['1 duckling', '1 cup cherries']), ['Duck']);
  assert.deepEqual(detectTags('Duck and Chicken Liver Pâté', ['200 g duck livers', '200 g chicken livers']), ['Poultry', 'Duck']);
  assert.deepEqual(detectTags('Fried Duck Eggs', ['4 duck eggs', 'chives']), ['Vegetarian']);
});

test('shellfish is its own tag, apart from fish', () => {
  assert.deepEqual(detectTags('Garlic Butter Shrimp', ['1 lb shrimp', '4 tbsp butter']), ['Shellfish']);
  assert.deepEqual(detectTags('Weeknight Dinner', ['2 lb mussels', '1 cup white wine']), ['Shellfish']);
  assert.deepEqual(detectTags('Crab Cakes', ['1 lb lump crabmeat', 'panko']), ['Shellfish']);
  assert.deepEqual(detectTags('Grilled Calamari', ['1 lb squid, cleaned', 'lemon']), ['Shellfish']);
  assert.deepEqual(detectTags('Paella', ['8 oz cod', '12 prawns', '1 lb clams', 'rice']), ['Fish', 'Shellfish']);
  // Seasonings made from shellfish don't make it a shellfish dish, but do stop it being vegetarian.
  assert.deepEqual(detectTags('Beef and Broccoli', ['1 lb flank steak', '3 tbsp oyster sauce']), ['Beef']);
  assert.deepEqual(detectTags('Stir-Fried Morning Glory', ['1 bunch morning glory', '1 tsp shrimp paste']), []);
  assert.deepEqual(detectTags('Chowder Base', ['2 potatoes', '1 cup clam juice', 'cream']), []);
  assert.deepEqual(detectTags('Fried Rice', ['2 cups rice', '2 tbsp dried shrimp', 'scallions']), []);
});

test('splitOldTags moves old Poultry and Fish recipes onto the new tags', () => {
  assert.deepEqual(splitOldTags(['Poultry'], 'Roast Turkey', ['1 turkey']), ['Turkey']);
  assert.deepEqual(splitOldTags(['Chicken'], 'Crispy Duck', ['4 duck legs']), ['Duck']);
  assert.deepEqual(splitOldTags(['Poultry', 'Pork'], 'Turducken', ['1 turkey', '1 duck', '1 chicken', '1 lb pork sausage']), ['Poultry', 'Turkey', 'Duck', 'Pork']);
  assert.deepEqual(splitOldTags(['Poultry'], 'Chicken Piccata', ['4 chicken breasts']), ['Poultry']);
  assert.deepEqual(splitOldTags(['Fish'], 'Garlic Shrimp', ['1 lb shrimp']), ['Shellfish']);
  assert.deepEqual(splitOldTags(['Fish'], 'Paella', ['8 oz cod', '12 prawns']), ['Fish', 'Shellfish']);
  // A tag the cook chose that the guess doesn't see is left alone.
  assert.deepEqual(splitOldTags(['Poultry', 'Vegetarian'], 'Mystery Dish', ['2 cups rice']), ['Poultry', 'Vegetarian']);
  assert.deepEqual(splitOldTags(['Beef'], 'Surf and Turf', ['2 steaks', '12 shrimp']), ['Beef']);
});
