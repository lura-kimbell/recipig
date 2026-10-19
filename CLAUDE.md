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
- API: `GET/POST /api/recipes`, `POST /api/recipes/import {url}`, `GET/PUT/DELETE /api/recipes/:id`. All input to PUT goes through `parseRecipeInput` (`backend/src/validate.ts`).
- Step-to-ingredient links are stored on each step as `ingredientIds` and are auto-detected at import (`backend/src/link.ts`); the editor lets the user correct them.
- The importer fetches user-supplied URLs, so `fetchPage.ts` must keep refusing private/loopback addresses on every redirect hop. The server binds to localhost by default for the same reason.

## Status

The first version was written in a session with no access to the npm registry, so only the dependency-free parts were run:

- Verified: `link`, `validate`, `fetchPage` (address guard) and `store` tests pass under plain `node --test`.
- **Not yet run:** `extract` and `app` tests (need cheerio/express), `tsc` typecheck, and the Angular build/UI. Expect to fix small errors on first `npm install` + build, then update this section.
- No `package-lock.json` yet; commit the lockfiles after the first install.
