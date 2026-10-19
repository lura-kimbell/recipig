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
