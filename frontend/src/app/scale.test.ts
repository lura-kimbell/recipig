import assert from 'node:assert/strict';
import test from 'node:test';
import { scaleIngredientText } from './scale.ts';

/** Check a list of [text, factor, expected] cases, naming the failing one. */
function check(cases: [string, number, string][]): void {
  for (const [text, factor, expected] of cases) {
    assert.equal(scaleIngredientText(text, factor), expected, `${text} x${factor}`);
  }
}

test('1x leaves the text exactly as it was', () => {
  for (const text of ['2 large eggs', '3/4 cup cheese', 'salt to taste', '']) {
    assert.equal(scaleIngredientText(text, 1), text);
  }
});

test('whole numbers', () => {
  check([
    ['2 large eggs', 2, '4 large eggs'],
    ['2 large eggs', 3, '6 large eggs'],
    ['4 garlic cloves, crushed', 4, '16 garlic cloves, crushed'],
    ['30 g kosher salt', 3, '90 g kosher salt'],
  ]);
});

test('fractions are written back as fractions', () => {
  check([
    ['3/4 cup sharp cheddar cheese, shredded', 2, '1 1/2 cups sharp cheddar cheese, shredded'],
    ['3/4 cup sharp cheddar cheese, shredded', 3, '2 1/4 cups sharp cheddar cheese, shredded'],
    ['3/4 cup sharp cheddar cheese, shredded', 4, '3 cups sharp cheddar cheese, shredded'],
    ['1/3 cup sugar', 2, '2/3 cup sugar'],
    ['1/3 cup sugar', 3, '1 cup sugar'],
    ['1/3 cup sugar', 4, '1 1/3 cups sugar'],
    ['1/8 tsp nutmeg', 3, '3/8 tsp nutmeg'],
  ]);
});

test('fraction glyphs stay glyphs', () => {
  check([
    ['½ cup (130g) soy sauce', 2, '1 cup (260g) soy sauce'],
    ['½ cup (130g) soy sauce', 3, '1½ cups (390g) soy sauce'],
    ['⅛ cup (30g) brown sugar', 2, '¼ cup (60g) brown sugar'],
    ['⅛ cup (30g) brown sugar', 3, '⅜ cup (90g) brown sugar'],
    ['⅛ cup (30g) brown sugar', 4, '½ cup (120g) brown sugar'],
    ['1½ cups flour', 2, '3 cups flour'],
    ['1 ½ cups flour', 3, '4 ½ cups flour'],
    ['¾ tsp salt', 3, '2¼ tsp salt'],
  ]);
});

test('mixed numbers and decimals', () => {
  check([
    ['1 1/2 cups flour', 2, '3 cups flour'],
    ['1 1/2 cups flour', 3, '4 1/2 cups flour'],
    ['1-1/2 cups flour', 2, '3 cups flour'],
    ['1.5 cups milk', 3, '4.5 cups milk'],
    ['0.25 tsp salt', 3, '0.75 tsp salt'],
    ['1,000 g flour', 2, '2,000 g flour'],
  ]);
});

test('ranges scale at both ends', () => {
  check([
    ['2-3 tbsp olive oil', 2, '4-6 tbsp olive oil'],
    ['2–3 tbsp olive oil', 2, '4–6 tbsp olive oil'],
    ['1/2 to 1 cup water', 2, '1 to 2 cups water'],
    ['1-2 cloves garlic', 3, '3-6 cloves garlic'],
  ]);
});

test('amounts inside brackets scale too', () => {
  check([
    ['2 quarts (2L) water', 2, '4 quarts (4L) water'],
    ['1 Tbsp (15g) kosher salt', 3, '3 Tbsp (45g) kosher salt'],
    ['2 tsp (5g) black peppercorn', 2, '4 tsp (10g) black peppercorn'],
    ['¼ cup (60g) unsalted butter, cubed', 4, '1 cup (240g) unsalted butter, cubed'],
  ]);
});

test('the size on a can is not an amount to scale; the number of cans is', () => {
  check([
    ['1 (14 oz) can diced tomatoes', 2, '2 (14 oz) cans diced tomatoes'],
    ['2 (15 oz) cans black beans', 3, '6 (15 oz) cans black beans'],
    ['1 can (14 oz) tomatoes', 2, '2 cans (28 oz) tomatoes'],
  ]);
});

test('units become plural once there is more than one', () => {
  check([
    ['1 cup flour', 2, '2 cups flour'],
    ['1 tablespoon honey', 3, '3 tablespoons honey'],
    ['1 clove garlic', 2, '2 cloves garlic'],
    ['1 bunch parsley', 2, '2 bunches parsley'],
    ['1 Tablespoon honey', 2, '2 Tablespoons honey'],
    ['1 large handful spinach', 2, '2 large handfuls spinach'],
    ['1 loaf bread', 2, '2 loaves bread'],
    ['1 stick (4 oz) butter', 2, '2 sticks (8 oz) butter'],
    ['1 pinch salt', 2, '2 pinches salt'],
  ]);
});

test('units stay singular while the amount is one or less', () => {
  check([
    ['½ cup flour', 2, '1 cup flour'],
    ['1/4 cup flour', 4, '1 cup flour'],
    ['1/2 bunch parsley', 2, '1 bunch parsley'],
  ]);
});

test('abbreviated units never change', () => {
  check([
    ['1 tsp salt', 3, '3 tsp salt'],
    ['1 tbsp oil', 2, '2 tbsp oil'],
    ['1 lb ground beef', 2, '2 lb ground beef'],
    ['1 oz chocolate', 4, '4 oz chocolate'],
    // The thing after the unit must not be mistaken for something being counted.
    ['1 tsp black pepper', 3, '3 tsp black pepper'],
    ['1 Tbsp (15g) kosher salt', 3, '3 Tbsp (45g) kosher salt'],
    ['1 tbsp. lemon zest', 2, '2 tbsp. lemon zest'],
    ['1 lb chicken thigh', 2, '2 lb chicken thigh'],
    ['1 fl oz vanilla', 2, '2 fl oz vanilla'],
    ['1 c sugar', 2, '2 c sugar'],
  ]);
});

test('counted things become plural', () => {
  check([
    ['1 egg', 2, '2 eggs'],
    ['1 large egg, beaten', 3, '3 large eggs, beaten'],
    ['1 lemon, quartered', 2, '2 lemons, quartered'],
    ['1 chicken breast', 2, '2 chicken breasts'],
    ['1 medium yellow onion, diced', 2, '2 medium yellow onions, diced'],
    ['1 onion finely chopped', 2, '2 onions finely chopped'],
    ['1 bay leaf', 2, '2 bay leaves'],
    ['1 tomato', 3, '3 tomatoes'],
    ['1 cherry', 2, '2 cherries'],
    ['1 peach', 2, '2 peaches'],
    ['1 egg for brushing', 2, '2 eggs for brushing'],
    ['1 (3-inch) cinnamon stick', 2, '2 (3-inch) cinnamon sticks'],
    ['Juice of 1 lemon', 2, 'Juice of 2 lemons'],
  ]);
});

test('things that are already plural, or never plural, are left alone', () => {
  check([
    ['2 large eggs', 2, '4 large eggs'],
    ['1 sprigs of rosemary', 2, '2 sprigs of rosemary'],
    ['1 fish fillet', 2, '2 fish fillets'],
    ['1 whole fish', 2, '2 whole fish'],
  ]);
});

test('numbers that are not amounts are left alone', () => {
  check([
    ['1 cup 2% milk', 2, '2 cups 2% milk'],
    ['1 lb 80/20 ground beef', 2, '2 lb 80/20 ground beef'],
    ['1 (2-inch) piece ginger', 2, '2 (2-inch) pieces ginger'],
    ['2 tbsp oil, heated to 350°F', 2, '4 tbsp oil, heated to 350°F'],
    ['2 x 400g tins chopped tomatoes', 2, '4 x 400g tins chopped tomatoes'],
    ['1 9 x 13 inch pan of lasagna', 2, '2 9 x 13 inch pan of lasagna'],
    ['Vitamin B12 tablet', 2, 'Vitamin B12 tablet'],
  ]);
});

test('text with no amount comes back unchanged', () => {
  check([
    ['salt and pepper to taste', 2, 'salt and pepper to taste'],
    ['Olive oil, for frying', 4, 'Olive oil, for frying'],
  ]);
});

test('servings text scales the same way', () => {
  check([
    ['4 servings', 2, '8 servings'],
    ['1 serving', 2, '2 servings'],
    ['4-6 servings', 2, '8-12 servings'],
    ['Serves 4', 3, 'Serves 12'],
    ['Makes 12 cookies', 2, 'Makes 24 cookies'],
    ['Makes 1 loaf', 2, 'Makes 2 loaves'],
  ]);
});

test('the lines from the chicken piccata recipe at 2x', () => {
  check([
    ['1 chicken breast', 2, '2 chicken breasts'],
    ['2 quarts (2L) water', 2, '4 quarts (4L) water'],
    ['½ cup (130g) soy sauce', 2, '1 cup (260g) soy sauce'],
    ['30 g kosher salt', 2, '60 g kosher salt'],
    ['4 garlic cloves, crushed', 2, '8 garlic cloves, crushed'],
    ['4 sprigs of thyme', 2, '8 sprigs of thyme'],
    ['2 bay leaves', 2, '4 bay leaves'],
    ['1 lemon, quartered', 2, '2 lemons, quartered'],
    ['1 bunch parsley', 2, '2 bunches parsley'],
    ['½ bunch, parsley, rough chopped', 2, '1 bunch, parsley, rough chopped'],
    ['2 Tbsp (15g) capers', 2, '4 Tbsp (30g) capers'],
    ['½ tsp (2g) onion powder', 2, '1 tsp (4g) onion powder'],
  ]);
});

test('a bad factor changes nothing', () => {
  for (const factor of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(scaleIngredientText('2 eggs', factor), '2 eggs');
  }
});

test('halving: whole numbers become fractions, and words go back to singular', () => {
  check([
    ['2 large eggs', 0.5, '1 large egg'],
    ['1 egg', 0.5, '1/2 egg'],
    ['3 eggs', 0.5, '1 1/2 eggs'],
    ['2 cups flour', 0.5, '1 cup flour'],
    ['1 1/2 cups flour', 0.5, '3/4 cup flour'],
    ['1 cup milk', 0.5, '1/2 cup milk'],
    ['3/4 cup sugar', 0.5, '3/8 cup sugar'],
    ['1/8 tsp nutmeg', 0.5, '1/16 tsp nutmeg'],
    ['2 cloves garlic', 0.5, '1 clove garlic'],
    ['2 tomatoes', 0.5, '1 tomato'],
    ['2 bay leaves', 0.5, '1 bay leaf'],
    ['2 boxes pasta', 0.5, '1 box pasta'],
    ['1 (14 oz) can tomatoes', 0.5, '1/2 (14 oz) can tomatoes'],
    ['2-3 carrots', 0.5, '1-1 1/2 carrots'],
    ['1.5 cups rice', 0.5, '0.75 cup rice'],
    ['2 tbsp butter', 0.5, '1 tbsp butter'],
  ]);
});
