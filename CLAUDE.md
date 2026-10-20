# Recipig

Personal recipe app: import a recipe from a URL (recipe only, no blog fluff), save it, edit it, tick off ingredients as purchased, and expand per-step ingredient reminders.

## Stack

- `backend/`: Node 22, Express 5, TypeScript run with `tsx`, cheerio for HTML parsing. Storage is a JSON file (`backend/data/recipes.json`).
- `frontend/`: Angular 20, standalone components, signals, inline templates, one global stylesheet (`src/styles.css`). Dev server proxies `/api` to `127.0.0.1:3000`.

## Commands

- Backend: `cd backend && npm install && npm run dev` (API on :3000), `npm test`, `npm run typecheck`
- Frontend: `cd frontend && npm install && npm start` (:4200), `npm run build` (output `dist/frontend/browser`, which the backend serves when present)

## Conventions

- Backend imports use explicit `.ts` extensions (`allowImportingTsExtensions`). Avoid TS syntax Node can't strip natively (parameter properties, enums, namespaces) so the dependency-free tests also run with plain `node --test`.
- API: `GET/POST /api/recipes`, `POST /api/recipes/import {url}`, `GET/PUT/DELETE /api/recipes/:id`. All input to POST (create) and PUT goes through `parseRecipeInput` (`backend/src/validate.ts`).
- Ingredients and steps each have an optional `section` label. The UI groups consecutive items with the same label; the key is omitted (not empty) when there is none. A single label shared by every item is dropped on import because it divides nothing. Step linking uses the step's section to break ties between same-named ingredients.
- Frontend: `RecipeEdit` is both the edit form (`/recipes/:id/edit`) and the blank-recipe form (`/recipes/new`, route data `{ mode: 'create' }`). The header "New Recipe" menu (in `app.ts`) links to `/recipes/new` and `/import` (`RecipeImport`).
- Look and feel: a cosy, pastel "village" style (Animal Crossing-ish). All colours, fonts and the dark theme are tokens at the top of `frontend/src/styles.css`; change those rather than adding colours in components. Fonts (Fredoka, Nunito) load from Google Fonts in `index.html` with rounded system fallbacks. Keep text contrast readable on every pastel tile, and keep animations behind the reduced-motion rule at the end of the file.
- Batch size (1x-4x) is display-only: `RecipeDetail` keeps a `multiplier` signal and shows `scaleIngredientText(text, factor)` from `frontend/src/app/scale.ts`; the stored recipe is never rewritten. `scale.ts` must stay free of imports and TypeScript-only syntax so `scale.test.ts` runs under plain `node --test` (and `npm test` in `frontend/`, which uses tsx). Add a test case for any ingredient line that scales wrongly.
- Step-to-ingredient links are stored on each step as `ingredientIds` and are auto-detected at import (`backend/src/link.ts`); the editor lets the user correct them.
- The importer fetches user-supplied URLs, so `fetchPage.ts` must keep refusing private/loopback addresses on every redirect hop. The server binds to localhost by default for the same reason.

## Status

Written in sessions with no access to the npm registry, so nothing that needs `npm install` has been run by Claude:

- Verified here: `link`, `validate`, `fetchPage` (address guard) and `store` tests pass under plain `node --test`.
- Not run by Claude: `extract` and `app` tests (need cheerio/express), `tsc` typecheck, the Angular build. The owner has since run the app locally and imported recipes successfully, but has not reported the test results.
- Extractor fallback: when a page's structured data is missing or a stub (e.g. a Webflow site whose JSON-LD has no ingredients or steps because a script adds them in the browser), `extract.ts` reads the lists under the page's "Ingredients" and "Directions" headings. Its tests were written against the structure of a real page but have not been run: run `cd backend && npm test` and fix anything that fails.
- Sections, the create endpoint, the header menu, the blank-recipe form and the import page were added later in the same no-npm situation: their `extract` and `app` tests and all Angular code are unrun. Expect to fix small template or type errors on the first `npm start`.
- The restyle was checked by rendering static mock pages that use the real stylesheet (light, dark, desktop, phone); it has not been seen in the running Angular app.
- Batch size: the scaling logic (`scale.ts`, 18 test groups) was run and passes under plain `node --test`; the buttons and template wiring in `recipe-detail.ts` are unrun, as is the new `tsx` dev dependency in `frontend/package.json`.
- No `package-lock.json` is committed yet; commit the lockfiles after an install.
