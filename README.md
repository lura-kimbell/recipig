# 🐷 Recipig

A personal recipe app. Paste a link to a recipe and Recipig saves just the recipe: no life story, ads or comments.

## Features

- **New Recipe menu.** The button in the header offers **Create New Recipe** (the edit form, empty) and **Import from URL**.
- **Import from a URL.** Reads the recipe data that sites publish for search engines (schema.org JSON-LD, then microdata). If a page has none, or only a stub, it reads the lists under the page's "Ingredients" and "Directions" headings instead. You get the title, times, ingredients and steps only.
- **Saved recipes.** Imported recipes are stored and listed so you can come back to them.
- **Sections.** Ingredients and steps can be grouped under labels such as "Brine" or "Sauce". Imports keep the page's labels; in the editor, type a label in an item's Section box (items with the same label are grouped).
- **Edit.** Change the title, times, ingredients, steps and sections; add, remove and reorder steps.
- **Shopping checkboxes.** Tick off ingredients as you buy them; ticks are saved.
- **Ingredients alongside each step.** Each step has an expandable section repeating the quantities of the ingredients it mentions (for "mix the eggs with the cheese" you'll see "2 large eggs" and "3/4 cup sharp cheddar cheese"). Links are detected automatically on import and can be corrected in the editor.

## Running it

You need Node.js 20 or newer.

```bash
# Terminal 1: API on http://127.0.0.1:3000
cd backend
npm install
npm run dev

# Terminal 2: Angular dev server on http://localhost:4200 (proxies /api to the backend)
cd frontend
npm install
npm start
```

Open http://localhost:4200.

To serve everything from one port instead, build the frontend and start the backend; it serves the built app:

```bash
cd frontend && npm run build
cd ../backend && npm start     # http://127.0.0.1:3000
```

Recipes are stored in `backend/data/recipes.json` (git-ignored). Set `DATA_DIR` to put them elsewhere. `PORT` and `HOST` are also configurable; the server listens on localhost only by default because it has no login.

## Tests

```bash
cd backend && npm test
```

## Layout

```
backend/    Express + TypeScript API
  src/extract.ts    pull the recipe out of a page's HTML
  src/link.ts       match step text to ingredients
  src/fetchPage.ts  download a page (refuses private/local addresses)
  src/store.ts      JSON-file storage
frontend/   Angular app (standalone components, signals)
```

## Limitations

- Import works for sites that publish structured recipe data, which is most big recipe sites. Pages without it are rejected with a clear message.
- Pages that need JavaScript to show the recipe, or that block automated requests, may not import.
- Ingredient-to-step matching is keyword based. It's good, not perfect, so use the editor to fix a link. When two ingredients share a name (salt in both the brine and the seasoning), the step's section decides which one it shows.
