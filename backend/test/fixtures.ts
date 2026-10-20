/** A typical food-blog page: a long story, ads and comments around schema.org JSON-LD. */
export const BLOG_PAGE = `<!doctype html>
<html><head><title>The Best Cheesy Scramble | Cozy Kitchen Blog</title>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {"@type": "WebSite", "name": "Cozy Kitchen Blog"},
    {
      "@type": "Recipe",
      "name": "Cheesy Scrambled Eggs",
      "image": ["https://cdn.example.com/eggs.jpg"],
      "recipeYield": ["2", "2 servings"],
      "prepTime": "PT5M",
      "cookTime": "PT10M",
      "totalTime": "PT1H15M",
      "recipeIngredient": [
        "2 large eggs",
        "3/4 cup sharp cheddar cheese, shredded",
        "1 tbsp butter",
        "Salt &amp; pepper"
      ],
      "recipeInstructions": [
        {"@type": "HowToStep", "text": "Melt the butter in a pan."},
        {"@type": "HowToStep", "text": "Mix the eggs with the cheese."},
        {"@type": "HowToStep", "text": "Cook gently, stirring, until set."}
      ]
    }
  ]
}
</script></head>
<body>
<h1>The Best Cheesy Scramble</h1>
<p>Last summer my grandmother and I spent a rainy afternoon reminiscing about her kitchen...</p>
<div class="ad">Buy our cookbook!</div>
<div class="comments">Love this! - Karen</div>
</body></html>`;

/** Sections, numbered strings and an HTML-in-string instruction list. */
export const SECTIONED_PAGE = `<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Recipe","name":"Layered Dip",
 "recipeYield": 8,
 "recipeIngredient": ["1 can black beans", "1 cup salsa"],
 "recipeInstructions": [
   {"@type":"HowToSection","name":"Beans","itemListElement":[
      {"@type":"HowToStep","text":"1. Drain and rinse the beans."},
      {"@type":"HowToStep","text":"Mash the beans."}]},
   {"@type":"HowToSection","name":"Assemble","itemListElement":[
      {"@type":"HowToStep","text":"Spread the salsa over the beans."}]}
 ]}
</script></head><body></body></html>`;

/** Instructions as one string with line breaks, plus ISO duration edge cases. */
export const STRING_INSTRUCTIONS_PAGE = `<html><head>
<script type="application/ld+json">
{"@type":"Recipe","name":"Toast","recipeIngredient":["2 slices bread"],
 "totalTime":"PT45M","recipeYield":"1 serving",
 "recipeInstructions":"Step 1: Toast the bread.<br>2) Butter the bread.\\nServe warm."}
</script></head><body></body></html>`;

/** Old-school microdata with no JSON-LD. */
export const MICRODATA_PAGE = `<html><body>
<div itemscope itemtype="https://schema.org/Recipe">
  <h1 itemprop="name">Garlic Bread</h1>
  <meta itemprop="totalTime" content="PT20M">
  <span itemprop="recipeYield">4 servings</span>
  <ul>
    <li itemprop="recipeIngredient">1 loaf bread</li>
    <li itemprop="recipeIngredient">3 cloves garlic, minced</li>
  </ul>
  <div itemprop="recipeInstructions"><ol><li>Mix the garlic with butter.</li><li>Spread on the bread and bake.</li></ol></div>
</div>
</body></html>`;

export const NO_RECIPE_PAGE = `<html><head><title>About us</title></head><body><p>We love food.</p></body></html>`;

/**
 * Modelled on a Webflow recipe page: the JSON-LD is a stub (title and image, but
 * empty times and no ingredients or steps, which a script fills in later in the
 * browser), and the real recipe is only in the visible "Ingredients" and
 * "Directions" sections, split into labelled sub-sections.
 */
export const STUB_JSONLD_PAGE = `<!DOCTYPE html><html><head>
<title>Perfect Chicken Piccata Recipe | Chef Example</title>
<meta content="Perfect Chicken Piccata | Chef Example" property="og:title"/>
<meta content="https://cdn.example.com/og.png" property="og:image"/>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Recipe","name":"Perfect Chicken Piccata",
 "image":"https://cdn.example.com/piccata.png","prepTime":"","cookTime":"","totalTime":"","recipeYield":""}
</script></head><body>
<div class="related"><h1>The Easiest Brownie Cookies (3 Ingredients)</h1><p>Related recipe teaser.</p></div>
<div class="column"><div class="ingredients-card"><h2 class="heading m">Ingredients</h2>
<article class="ingredients-list w-richtext">
<p><strong>Brine:</strong></p>
<ul role="list"><li>1 chicken breast</li><li>2 quarts (2L) water</li><li>30 g kosher salt</li></ul>
<p><strong>Seasoning &amp; Cooking:</strong></p>
<ul role="list"><li>2 lemons, juiced</li><li>&frac14; cup (60g) white wine</li></ul>
</article></div>
<div class="directions-wrapper"><h2 class="heading m">Directions</h2>
<div class="directions-list w-richtext">
<p><strong>Brine:</strong></p>
<ol role="list"><li>Whisk the salt into the water until dissolved.</li><li>Add the chicken breast and refrigerate for 6-8 hours. </li></ol>
<p><strong>Seasoning &amp; Cooking:</strong></p>
<ol role="list"><li>Deglaze the pan with white wine and lemon juice, then reduce.</li></ol>
</div></div></div>
<div class="comments"><h2>Comments</h2><p>Made this last night, so good!</p></div>
</body></html>`;

/** A stub JSON-LD block next to a complete microdata recipe. */
export const STUB_PLUS_MICRODATA_PAGE = `<html><head>
<script type="application/ld+json">{"@type":"Recipe","name":"Stub name"}</script></head><body>
<div itemscope itemtype="https://schema.org/Recipe">
  <h1 itemprop="name">Full Name</h1>
  <li itemprop="recipeIngredient">1 loaf bread</li>
  <div itemprop="recipeInstructions"><ol><li>Toast the bread.</li></ol></div>
</div></body></html>`;

/** No structured data; directions are plain paragraphs under an "Instructions" heading. */
export const PARAGRAPH_STEPS_PAGE = `<html><head><title>Simple Pasta - Cook Blog</title></head><body>
<h2>Ingredients:</h2>
<ul><li>200 g spaghetti</li><li>2 tbsp olive oil</li></ul>
<h2>Instructions</h2>
<p>Sauce:</p>
<p>1. Boil the spaghetti until tender.</p>
<p>Step 2: Toss the spaghetti with the olive oil.</p>
<h2>Notes</h2>
<p>Keeps for three days.</p>
</body></html>`;
