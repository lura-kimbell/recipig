# 🐷 Recipig

A personal recipe app. Paste a link to a recipe and Recipig saves just the recipe: no life story, ads or comments.

## Features

- **Accounts.** Create an account with just a username and password (no email), log in and log out. Usernames are unique (Alice and alice are the same). Every recipe you import, create or edit belongs to your account, and nobody else can see it. There is no password reset, so pick one you'll remember.
- **New Recipe menu.** The button in the header offers **Create New Recipe** (the edit form, empty) and **Import from URL**.
- **Import from a URL.** Reads the recipe data that sites publish for search engines (schema.org JSON-LD, then microdata). If a page has none, or only a stub, it reads the lists under the page's "Ingredients" and "Directions" headings instead. You get the title, times, ingredients and steps only.
- **Saved recipes.** Imported recipes are stored and listed so you can come back to them.
- **Sections.** Ingredients and steps can be grouped under labels such as "Brine" or "Sauce". Imports keep the page's labels; in the editor, type a label in an item's Section box (items with the same label are grouped).
- **Edit.** Change the title, image, times, ingredients, steps and sections; add, remove and reorder ingredients and steps. The image is a link to a picture (paste any image address; clear the box to remove it), for imported and hand-made recipes alike. In each step's "Ingredients shown with this step" list, an ingredient's section appears as a small tag beside its name.
- **Batch size.** Buttons at the top of a recipe (1x, 2x, 3x, 4x) multiply every ingredient amount, both in the ingredient list and in each step's ingredient reminder. Fractions stay fractions (3/4 cup doubled is 1 1/2 cups) and units follow along (1 cup becomes 2 cups, 1 egg becomes 2 eggs). Servings scale too. Your saved recipe is never changed.
- **Shopping checkboxes.** Tick off ingredients as you buy them; ticks are saved.
- **Ingredients alongside each step.** Each step has an expandable section repeating the quantities of the ingredients it mentions (for "mix the eggs with the cheese" you'll see "2 large eggs" and "3/4 cup sharp cheddar cheese"). Links are detected automatically on import and can be corrected in the editor.

## Running it

You need Node.js 20 or newer and a MongoDB server. The quickest way to get one is Docker:

```bash
docker run -d --name recipig-mongo -p 127.0.0.1:27017:27017 -v recipig-mongo:/data/db mongo:7
```

(Or install MongoDB yourself, or use a free MongoDB Atlas cluster and set `MONGODB_URI`.)

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

Settings (environment variables for the backend):

| Variable | Default | What it does |
| --- | --- | --- |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017` | Where MongoDB is |
| `MONGODB_DB` | `recipig` | Database name |
| `PORT`, `HOST` | `3000`, `127.0.0.1` | The server listens on localhost only by default, because it fetches web pages on behalf of logged-in users |
| `COOKIE_SECURE` | off | Set to `true` when the site is served over https, so the login cookie is only sent securely |
| `TRUST_PROXY` | off | Set (for example to `1`) when behind a reverse proxy, so login rate limiting sees real client addresses |

Collections: `users`, `sessions` and `recipes`; the indexes are created on startup.

### Moving over your old recipes

Earlier versions kept everything in `backend/data/recipes.json`. Create your account in the app first, then copy those recipes into it:

```bash
cd backend
npm run import-json -- yourusername            # or add a path to a recipes.json
```

Running it twice is safe: recipes already imported are skipped.

## Tests

```bash
cd backend && npm test    # API, accounts, importer, storage
cd frontend && npm test   # batch-size maths, safe redirects
```

The MongoDB storage tests are skipped unless you point them at a database (each test makes and drops its own temporary one):

```bash
cd backend && TEST_MONGODB_URI=mongodb://127.0.0.1:27017 npm test
```

## Layout

```
backend/    Express + TypeScript API
  src/extract.ts    pull the recipe out of a page's HTML
  src/link.ts       match step text to ingredients
  src/fetchPage.ts  download a page (refuses private/local addresses)
  src/stores.ts     storage interfaces (users, sessions, recipes)
  src/mongoStores.ts  MongoDB implementation (memoryStores.ts is the test stand-in)
  src/authRoutes.ts   register, login, logout, session lookup
  scripts/importJson.ts  move an old recipes.json into an account
frontend/   Angular app (standalone components, signals)
```

## Limitations

- Accounts are deliberately simple: no email, no password reset or change, no account deletion. Login attempts are rate limited in memory (reset when the server restarts).
- Import works for sites that publish structured recipe data, which is most big recipe sites. Pages without it are rejected with a clear message.
- Pages that need JavaScript to show the recipe, or that block automated requests, may not import.
- Batch size only multiplies ingredient lines (and servings). Amounts written inside the step text ("add 1 cup of water") are left as written, and odd phrasing can slip through, so glance at the scaled list before you shop.
- Ingredient-to-step matching is keyword based. It's good, not perfect, so use the editor to fix a link. When two ingredients share a name (salt in both the brine and the seasoning), the step's section decides which one it shows.
