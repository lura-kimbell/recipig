import assert from 'node:assert/strict';
import test from 'node:test';
import { extractRecipe, NoRecipeError, recipePhoto } from '../src/extract.ts';
import {
  BLOG_PAGE,
  MICRODATA_PAGE,
  NO_RECIPE_PAGE,
  PARAGRAPH_STEPS_PAGE,
  SECTIONED_PAGE,
  STRING_INSTRUCTIONS_PAGE,
  STUB_JSONLD_PAGE,
  STUB_PLUS_MICRODATA_PAGE,
  SUBHEADINGS_PAGE,
} from './fixtures.ts';

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
  // HowToSection names label their steps.
  assert.deepEqual(r.steps.map((s) => s.section), ['Beans', 'Beans', 'Assemble']);
  assert.ok(r.ingredients.every((i) => i.section === undefined));
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

test('reads the visible Ingredients and Directions when the structured data is a stub', () => {
  const r = extractRecipe(STUB_JSONLD_PAGE, 'https://chef.example.com/piccata');
  // Details the stub does have are kept; empty ones are dropped.
  assert.equal(r.title, 'Perfect Chicken Piccata');
  assert.equal(r.image, 'https://cdn.example.com/piccata.png');
  assert.equal(r.totalTime, undefined);
  assert.equal(r.servings, undefined);
  // Both sub-sections are read, in order, without their "Brine:" style labels in the text.
  assert.deepEqual(r.ingredients.map((i) => i.text), [
    '1 chicken breast',
    '2 quarts (2L) water',
    '30 g kosher salt',
    '2 lemons, juiced',
    '\u00bc cup (60g) white wine',
    '1 Tbsp (15g) kosher salt',
  ]);
  assert.deepEqual(r.steps.map((s) => s.text), [
    'Whisk the salt into the water until dissolved.',
    'Add the chicken breast and refrigerate for 6-8 hours.',
    'Deglaze the pan with white wine and lemon juice, then reduce.',
    'Season the chicken with salt on both sides.',
  ]);
  // Unrelated page content stays out.
  const everything = JSON.stringify(r);
  assert.ok(!everything.includes('Brownie'));
  assert.ok(!everything.includes('so good'));
});

test('keeps the sub-section labels from the page', () => {
  const r = extractRecipe(STUB_JSONLD_PAGE);
  const sc = 'Seasoning & Cooking';
  assert.deepEqual(r.ingredients.map((i) => i.section), ['Brine', 'Brine', 'Brine', sc, sc, sc]);
  assert.deepEqual(r.steps.map((s) => s.section), ['Brine', 'Brine', sc, sc]);
});

test('uses sections to pick the right one of two same-named ingredients', () => {
  const r = extractRecipe(STUB_JSONLD_PAGE);
  const linked = (i: number) => r.steps[i].ingredientIds.map((id) => r.ingredients.find((x) => x.id === id)?.text);
  // The brine step gets the brine salt, the seasoning step gets the seasoning salt.
  assert.deepEqual(linked(0), ['2 quarts (2L) water', '30 g kosher salt']);
  assert.deepEqual(linked(3), ['1 Tbsp (15g) kosher salt']);
  assert.ok(linked(2).includes('\u00bc cup (60g) white wine'));
});

test('reads h3 sub-headings as sections', () => {
  const r = extractRecipe(SUBHEADINGS_PAGE);
  assert.equal(r.title, 'Saucy Chicken');
  assert.deepEqual(r.ingredients.map((i) => i.section), ['For the sauce', 'For the sauce', 'For the chicken']);
  assert.deepEqual(r.steps.map((s) => s.text), ['Simmer the tomatoes with the garlic.', 'Roast the chicken thighs.']);
  assert.ok(r.steps.every((s) => s.section === undefined));
});

test('a lone section label is dropped, since it divides nothing', () => {
  const html = `<script type="application/ld+json">{"@type":"Recipe","name":"X","recipeIngredient":["1 egg"],
    "recipeInstructions":[{"@type":"HowToSection","name":"Instructions","itemListElement":[
      {"@type":"HowToStep","text":"Cook the egg."},{"@type":"HowToStep","text":"Serve."}]}]}</script>`;
  const r = extractRecipe(html);
  assert.equal(r.steps.length, 2);
  assert.ok(r.steps.every((s) => s.section === undefined));
});

test('a stub JSON-LD block does not hide a complete microdata recipe', () => {
  const r = extractRecipe(STUB_PLUS_MICRODATA_PAGE);
  assert.deepEqual(r.ingredients.map((i) => i.text), ['1 loaf bread']);
  assert.deepEqual(r.steps.map((s) => s.text), ['Toast the bread.']);
});

test('reads paragraph-style directions, skipping sub-headings and numbering', () => {
  const r = extractRecipe(PARAGRAPH_STEPS_PAGE);
  assert.equal(r.title, 'Simple Pasta');
  assert.deepEqual(r.ingredients.map((i) => i.text), ['200 g spaghetti', '2 tbsp olive oil']);
  assert.deepEqual(r.steps.map((s) => s.text), [
    'Boil the spaghetti until tender.',
    'Toss the spaghetti with the olive oil.',
  ]);
  // "Sauce:" is the only label, so it is dropped.
  assert.ok(r.steps.every((s) => s.section === undefined));
});

test('a stub with no readable ingredients and steps on the page is still not a recipe', () => {
  const html = '<script type="application/ld+json">{"@type":"Recipe","name":"Only a name"}</script><h2>Ingredients</h2>';
  assert.throws(() => extractRecipe(html), NoRecipeError);
});

test('tags imported recipes by main ingredient', () => {
  assert.deepEqual(extractRecipe(BLOG_PAGE).tags, ['Vegetarian']);
  assert.deepEqual(extractRecipe(STUB_JSONLD_PAGE).tags, ['Poultry']);
});

/** A minimal recipe page whose JSON-LD image value (and optional share image) is as given. */
function pageWithImages(image: unknown, ogImage?: string): string {
  const recipe = {
    '@type': 'Recipe',
    name: 'Corn Salad',
    image,
    recipeIngredient: ['2 ears corn'],
    recipeInstructions: [
      // A big step photo, which must never be picked as the recipe's image.
      { '@type': 'HowToStep', text: 'Grill the corn.', image: 'https://cdn.example.com/step-1-2400x1600.jpg' },
    ],
  };
  const og = ogImage ? `<meta property="og:image" content="${ogImage}">` : '';
  return `<html><head>${og}<script type="application/ld+json">${JSON.stringify(recipe)}</script></head><body></body></html>`;
}

const imageOf = (image: unknown, ogImage?: string) => extractRecipe(pageWithImages(image, ogImage), 'https://blog.example.com/corn').image;

test('takes the largest size of the recipe photo, not the first thumbnail', () => {
  const sizes = ['corn-500x500.jpg', 'corn-1200x1200.jpg', 'corn-500x375.jpg', 'corn-480x270.jpg'];
  assert.equal(imageOf(sizes.map((f) => `https://cdn.example.com/${f}`)), 'https://cdn.example.com/corn-1200x1200.jpg');
});

test('among sharp versions, prefers the landscape crop', () => {
  const list = [
    { '@type': 'ImageObject', url: 'https://img.example.com/dish-square-at-3x.jpg', width: 1800, height: 1800 },
    { '@type': 'ImageObject', url: 'https://img.example.com/dish-16x9-jumbo.jpg', width: 1600, height: 900 },
    { '@type': 'ImageObject', url: 'https://img.example.com/dish-thumb-wide.jpg', width: 400, height: 200 },
    // Wider still, but smaller: a wider shape alone doesn't win.
    { '@type': 'ImageObject', url: 'https://img.example.com/dish-facebook.jpg', width: 1050, height: 550 },
  ];
  assert.equal(imageOf(list), 'https://img.example.com/dish-16x9-jumbo.jpg');
});

test('uses the full-size original when every listed size is small', () => {
  const list = ['corn-225x225.jpg', 'corn-260x195.jpg', 'corn.jpg'].map((f) => `https://cdn.example.com/${f}`);
  assert.equal(imageOf(list), 'https://cdn.example.com/corn.jpg');
});

test('picks among crops whose sizes the page states', () => {
  const list = [
    { '@type': 'ImageObject', url: 'https://img.example.com/a/square.jpg', width: 600, height: 600 },
    { '@type': 'ImageObject', url: 'https://img.example.com/b/wide.jpg', width: '1600', height: '900' },
  ];
  assert.equal(imageOf(list), 'https://img.example.com/b/wide.jpg');
});

test('never swaps in a different photo or a step photo', () => {
  // A second, unrelated picture with no stated size stays out, however big its file name says it is.
  assert.equal(
    imageOf(['https://cdn.example.com/corn-225x225.jpg', 'https://cdn.example.com/pinterest-collage-1000x1500.jpg']),
    'https://cdn.example.com/corn-225x225.jpg',
  );
  // The step photo (2400px) is ignored; the recipe image is the only candidate.
  assert.equal(imageOf('https://cdn.example.com/corn-500x500.jpg'), 'https://cdn.example.com/corn-500x500.jpg');
});

test("uses the share image only when it is the same photo's full size", () => {
  assert.equal(imageOf('https://cdn.example.com/corn-225x225.jpg', 'https://cdn.example.com/corn.jpg'), 'https://cdn.example.com/corn.jpg');
  assert.equal(
    imageOf('https://cdn.example.com/corn-225x225.jpg', 'https://cdn.example.com/share-card-1200x630.jpg'),
    'https://cdn.example.com/corn-225x225.jpg',
  );
  // With no recipe image at all, the share image is still better than nothing.
  assert.equal(imageOf(undefined, 'https://cdn.example.com/share-card-1200x630.jpg'), 'https://cdn.example.com/share-card-1200x630.jpg');
});

test('recipePhoto only claims photos the page offers for the recipe', () => {
  const html = pageWithImages(['https://cdn.example.com/corn-225x225.jpg', 'https://cdn.example.com/corn-1200x1200.jpg']);
  const photo = recipePhoto(html, 'https://blog.example.com/corn');
  assert.equal(photo.best, 'https://cdn.example.com/corn-1200x1200.jpg');
  assert.equal(photo.offers('https://cdn.example.com/corn-225x225.jpg'), true);
  assert.equal(photo.offers('https://cdn.example.com/corn-500x500.jpg'), true); // same photo, size not listed
  assert.equal(photo.offers('https://cdn.example.com/step-1-2400x1600.jpg'), false); // a step photo
  assert.equal(photo.offers('https://my-photos.example.com/my-own-corn.jpg'), false); // chosen by the cook
});
