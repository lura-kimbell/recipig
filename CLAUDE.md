# Recipig

Personal recipe app: import a recipe from a URL (recipe only, no blog fluff), save it, edit it, tick off ingredients as purchased, and expand per-step ingredient reminders.

## Stack

- `backend/`: Node 22, Express 5, TypeScript run with `tsx`, cheerio for HTML parsing. Storage is MongoDB (`mongodb` driver); users log in with username + password.
- `frontend/`: Angular 20, standalone components, signals, inline templates, one global stylesheet (`src/styles.css`). Dev server proxies `/api` to `127.0.0.1:3000`.

## Commands

- Backend: `cd backend && npm install && npm run dev` (API on :3000; needs MongoDB, see README), `npm test` (add `TEST_MONGODB_URI=...` to run the Mongo store tests), `npm run typecheck`, `npm run import-json -- <username>` (moves an old `recipes.json` into an account)
- Frontend: `cd frontend && npm install && npm start` (:4200), `npm run build` (output `dist/frontend/browser`, which the backend serves when present)

## Conventions

- Backend imports use explicit `.ts` extensions (`allowImportingTsExtensions`). Avoid TS syntax Node can't strip natively (parameter properties, enums, namespaces) so the dependency-free tests also run with plain `node --test`.
- Accounts: `POST /api/auth/register|login|logout`, `GET /api/auth/me`. Passwords are scrypt hashes (`password.ts`). A login is a random token in an httpOnly SameSite=Lax cookie (`recipig_session`); only its SHA-256 hash is stored in `sessions`. Every `/api/recipes*` route requires a user and every store call takes the `userId`; another user's recipe is a 404, never a 403. Don't add a recipe path that skips `userId`. Storage is behind the interfaces in `stores.ts`: `mongoStores.ts` for real, `memoryStores.ts` for tests; both must pass `test/storeContract.ts`.
- API: `GET/POST /api/recipes`, `POST /api/recipes/import {url}`, `GET/PUT/DELETE /api/recipes/:id`. All input to POST (create) and PUT goes through `parseRecipeInput` (`backend/src/validate.ts`).
- Ingredients and steps each have an optional `section` label. The UI groups consecutive items with the same label; the key is omitted (not empty) when there is none. A single label shared by every item is dropped on import because it divides nothing. Step linking uses the step's section to break ties between same-named ingredients.
- Frontend: `RecipeEdit` is both the edit form (`/recipes/:id/edit`) and the blank-recipe form (`/recipes/new`, route data `{ mode: 'create' }`). The header "New Recipe" menu (in `app.ts`) links to `/recipes/new` and `/import` (`RecipeImport`).
- Look and feel: a cosy, pastel "village" style (Animal Crossing-ish). Light theme only (no dark mode for now; `color-scheme: light` keeps form controls light on dark-mode systems). All colours and fonts are tokens at the top of `frontend/src/styles.css`; change those rather than adding colours in components. Fonts (Fredoka, Nunito) load from Google Fonts in `index.html` with rounded system fallbacks. Keep text contrast readable on every pastel tile, and keep animations behind the reduced-motion rule at the end of the file.
- Batch size (1x-4x) is display-only: `RecipeDetail` keeps a `multiplier` signal and shows `scaleIngredientText(text, factor)` from `frontend/src/app/scale.ts`; the stored recipe is never rewritten. `scale.ts` must stay free of imports and TypeScript-only syntax so `scale.test.ts` runs under plain `node --test` (and `npm test` in `frontend/`, which uses tsx). Add a test case for any ingredient line that scales wrongly.
- `frontend/src/app/auth.util.ts` (`safeReturnUrl`, stops open redirects after login) is import-free like `scale.ts`, so `auth.util.test.ts` runs under plain `node --test`. The login/create-account page is `auth-page.ts` (route data `{ mode: 'register' }`); `authGuard`/`guestGuard` protect routes and `authInterceptor` sends any 401 outside `/api/auth/` to `/login`.
- Tags: a fixed list of main-ingredient tags (`Chicken`, `Beef`, `Pork`, `Fish`, `Vegetarian`) in `RECIPE_TAGS`, defined in both `backend/src/tags.ts` and `frontend/src/app/models.ts` (keep them in sync). `recipe.tags` is omitted when empty; `parseRecipeInput` rejects unknown tags and stores them in list order. `detectTags` guesses them at import (a meat in the title wins, then the ingredients; stock, fish sauce and anchovies don't count as a main ingredient but do rule out Vegetarian); add a `tags.test.ts` case for any recipe it gets wrong. The list page filters by tag (any match, kept in `?tag=` query params); the editor has toggle pills. Tag icons are MingCute line SVGs in `frontend/public/tag-icons/` (Apache 2.0, see its README), applied as CSS masks per `data-tag` in `styles.css`; to change one, replace its SVG file.
- Nutrition: `RecipeDetail` shows an estimate computed in the browser by `estimateNutrition` (`frontend/src/app/nutrition.ts`) from the ingredient lines and the `FOODS` table (`nutrition-data.ts`, per-100 g values based on USDA FoodData Central, grams per cup / per item / per unit). Nothing is stored; the batch size multiplies the total and per serving divides by the servings number. Lines with no amount or an unknown food are listed as "Not counted", never guessed. Both files are import-free like `scale.ts`; add a `nutrition.test.ts` case for any line that is read wrongly, and add foods to the table as needed (the longest matching name wins).
- Step-to-ingredient links are stored on each step as `ingredientIds` and are auto-detected at import (`backend/src/link.ts`); the editor lets the user correct them.
- Hosting: `render.yaml` is a Render Blueprint (one Node web service: build the frontend, `npm ci --include=dev` in both folders because `tsx` and the Angular CLI are dev dependencies, start the backend). Production sets `HOST=0.0.0.0`, `COOKIE_SECURE=true`, `TRUST_PROXY=1`; `MONGODB_URI` (Atlas) and `SIGNUP_CODE` are secrets set in Render. With `SIGNUP_CODE` set, `/api/auth/register` needs a matching `inviteCode` (compared in constant time, attempts count toward the sign-up rate limit) and `GET /api/auth/signup` tells the form to ask for it.
- The importer fetches user-supplied URLs, so `fetchPage.ts` must keep refusing private/loopback addresses on every redirect hop. The server binds to localhost by default for the same reason.

## Status

- Live on Render (Blueprint in `render.yaml`) with MongoDB Atlas; the owner uses it day to day.
- Verified on 2026-10-21: backend `npm test` with `TEST_MONGODB_URI` set (76 tests, including the Mongo store contract and the Express/auth `app` tests), `npm run typecheck`, frontend `npm test` (29) and the same files under plain `node --test`, and `ng build`. Render's build and start commands were also run from a clean copy with production settings.
- Seen in a browser: recipe list (tags, filter, cards), recipe page (meta pills, batch size, nutrition), the editor's tag toggles, login/sign-up (invite code), header at desktop and phone widths.
- Not yet looked at in a browser: the editor's ingredient reorder buttons, image-link preview and section tags in the step ingredient picker (they build and type-check).
- Nutrition values were written from USDA reference figures; only flour, butter, whole milk and 85% ground beef were checked against the live FoodData Central API (DEMO_KEY rate limits stopped the rest). Treat other rows as approximate and correct them when a recipe looks off.
- Running a preview server from a tool: stopping the background task does not stop the `tsx` child process. Kill the node process too, or it keeps the port.
- Both `package-lock.json` files are committed; commit lockfile changes along with any dependency change.
