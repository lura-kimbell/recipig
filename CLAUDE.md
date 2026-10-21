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
- Step-to-ingredient links are stored on each step as `ingredientIds` and are auto-detected at import (`backend/src/link.ts`); the editor lets the user correct them.
- The importer fetches user-supplied URLs, so `fetchPage.ts` must keep refusing private/loopback addresses on every redirect hop. The server binds to localhost by default for the same reason.

## Status

- Accounts and MongoDB (added in a no-npm session): verified here under plain `node --test`: password hashing, cookie/session helpers, rate limiter, credential rules, the in-memory stores against the shared store contract, and the frontend `safeReturnUrl`. NOT run: `mongoStores.ts` (contract tests skip without `TEST_MONGODB_URI`; run `cd backend && TEST_MONGODB_URI=mongodb://127.0.0.1:27017 npm test`), the Express auth routes and rewritten `app.test.ts`, `tsc`, and all new Angular code (`auth-*.ts`, header, guards, interceptor). Expect small fixes on first run.
- Editor tweaks (ingredient reorder buttons, image link field with preview, section tags in the step ingredient picker): Angular template and CSS only, unrun and unseen.
- Favicon is now a hand-drawn SVG pig snout (`frontend/public/favicon.svg`); checked at 16-128px in Chromium.

Written in sessions with no access to the npm registry, so nothing that needs `npm install` has been run by Claude:

- Verified here: `link`, `validate`, and `fetchPage` (address guard) tests pass under plain `node --test`.
- Not run by Claude: `extract` and `app` tests (need cheerio/express), `tsc` typecheck, the Angular build. The owner has since run the app locally and imported recipes successfully, but has not reported the test results.
- Extractor fallback: when a page's structured data is missing or a stub (e.g. a Webflow site whose JSON-LD has no ingredients or steps because a script adds them in the browser), `extract.ts` reads the lists under the page's "Ingredients" and "Directions" headings. Its tests were written against the structure of a real page but have not been run: run `cd backend && npm test` and fix anything that fails.
- Sections, the create endpoint, the header menu, the blank-recipe form and the import page were added later in the same no-npm situation: their `extract` and `app` tests and all Angular code are unrun. Expect to fix small template or type errors on the first `npm start`.
- The restyle was checked by rendering static mock pages that use the real stylesheet (light, desktop, phone; the dark theme has since been removed); it has not been seen in the running Angular app.
- Batch size: the scaling logic (`scale.ts`, 18 test groups) was run and passes under plain `node --test`; the buttons and template wiring in `recipe-detail.ts` are unrun, as is the new `tsx` dev dependency in `frontend/package.json`.
- No `package-lock.json` is committed yet; commit the lockfiles after an install.
