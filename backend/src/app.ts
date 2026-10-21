import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { extractRecipe, NoRecipeError } from './extract.ts';
import { fetchPage, FetchError, UrlError } from './fetchPage.ts';
import type { FetchedPage } from './fetchPage.ts';
import { AuthError, createAuth, currentUser, RateLimitError } from './authRoutes.ts';
import { UsernameTakenError } from './stores.ts';
import type { Stores } from './stores.ts';
import { parseRecipeInput, ValidationError } from './validate.ts';

export interface AppOptions {
  /** Directory holding the built Angular app, served for any non-API route. */
  staticDir?: string;
  /** Swappable so tests don't hit the network. */
  fetchPage?: (url: string) => Promise<FetchedPage>;
  /** Add the Secure flag to the login cookie (turn on when served over https). */
  secureCookie?: boolean;
  /** Passed to Express's "trust proxy" setting when running behind a reverse proxy. */
  trustProxy?: string | number | boolean;
  /** Invite code required to create an account (see AuthOptions). */
  signupCode?: string;
  /** Swappable clock for tests. */
  now?: () => number;
}

export function createApp(stores: Stores, options: AppOptions = {}) {
  const getPage = options.fetchPage ?? fetchPage;
  const { recipes: store } = stores;
  const auth = createAuth(stores, { secureCookie: options.secureCookie, signupCode: options.signupCode, now: options.now });
  const app = express();
  if (options.trustProxy !== undefined) app.set('trust proxy', options.trustProxy);
  app.use(express.json({ limit: '1mb' }));

  // API answers belong to one logged-in person, so browsers and proxies shouldn't keep copies.
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', auth.loadUser);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', auth.router);

  // Everything under /api/recipes needs a logged-in user, and only ever touches that user's recipes.
  app.use('/api/recipes', auth.requireUser);

  app.get('/api/recipes', async (_req, res) => {
    res.json(await store.list(currentUser(res).id));
  });

  // A recipe written by hand in the editor.
  app.post('/api/recipes', async (req, res) => {
    res.status(201).json(await store.create(currentUser(res).id, parseRecipeInput(req.body)));
  });

  // Declared before /api/recipes/:id so "import" isn't read as an id.
  app.post('/api/recipes/import', async (req, res) => {
    const url: unknown = req.body?.url;
    if (typeof url !== 'string' || !url.trim()) {
      res.status(400).json({ error: 'Please provide a recipe link.' });
      return;
    }
    const { html, finalUrl } = await getPage(url.trim());
    const draft = extractRecipe(html, finalUrl);
    res.status(201).json(await store.create(currentUser(res).id, draft));
  });

  app.get('/api/recipes/:id', async (req, res) => {
    const recipe = await store.get(currentUser(res).id, req.params.id);
    if (!recipe) {
      res.status(404).json({ error: 'Recipe not found.' });
      return;
    }
    res.json(recipe);
  });

  app.put('/api/recipes/:id', async (req, res) => {
    const updated = await store.update(currentUser(res).id, req.params.id, parseRecipeInput(req.body));
    if (!updated) {
      res.status(404).json({ error: 'Recipe not found.' });
      return;
    }
    res.json(updated);
  });

  app.delete('/api/recipes/:id', async (req, res) => {
    if (!(await store.remove(currentUser(res).id, req.params.id))) {
      res.status(404).json({ error: 'Recipe not found.' });
      return;
    }
    res.status(204).end();
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });

  const { staticDir } = options;
  if (staticDir && fs.existsSync(path.join(staticDir, 'index.html'))) {
    app.use(express.static(staticDir));
    // Let the Angular router handle deep links such as /recipes/abc123.
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    let status = 500;
    let message = 'Something went wrong on the server.';

    if (err instanceof ValidationError || err instanceof UrlError) {
      status = 400;
      message = err.message;
    } else if (err instanceof AuthError) {
      status = 401;
      message = err.message;
    } else if (err instanceof UsernameTakenError) {
      status = 409;
      message = err.message;
    } else if (err instanceof RateLimitError) {
      status = 429;
      message = err.message;
    } else if (err instanceof NoRecipeError) {
      status = 422;
      message = err.message;
    } else if (err instanceof FetchError) {
      status = 502;
      message = err.message;
    } else if (typeof (err as { status?: unknown })?.status === 'number') {
      // Errors raised by body parsing (malformed JSON, payload too large).
      status = (err as { status: number }).status;
      message = 'Invalid request.';
    } else {
      console.error(err);
    }
    res.status(status).json({ error: message });
  });

  return app;
}
