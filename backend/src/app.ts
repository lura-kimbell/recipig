import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { extractRecipe, NoRecipeError } from './extract.ts';
import { fetchPage, FetchError, UrlError } from './fetchPage.ts';
import type { FetchedPage } from './fetchPage.ts';
import type { RecipeStore } from './store.ts';
import { parseRecipeInput, ValidationError } from './validate.ts';

export interface AppOptions {
  /** Directory holding the built Angular app, served for any non-API route. */
  staticDir?: string;
  /** Swappable so tests don't hit the network. */
  fetchPage?: (url: string) => Promise<FetchedPage>;
}

export function createApp(store: RecipeStore, options: AppOptions = {}) {
  const getPage = options.fetchPage ?? fetchPage;
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/recipes', async (_req, res) => {
    res.json(await store.list());
  });

  // A recipe written by hand in the editor.
  app.post('/api/recipes', async (req, res) => {
    res.status(201).json(await store.create(parseRecipeInput(req.body)));
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
    res.status(201).json(await store.create(draft));
  });

  app.get('/api/recipes/:id', async (req, res) => {
    const recipe = await store.get(req.params.id);
    if (!recipe) {
      res.status(404).json({ error: 'Recipe not found.' });
      return;
    }
    res.json(recipe);
  });

  app.put('/api/recipes/:id', async (req, res) => {
    const updated = await store.update(req.params.id, parseRecipeInput(req.body));
    if (!updated) {
      res.status(404).json({ error: 'Recipe not found.' });
      return;
    }
    res.json(updated);
  });

  app.delete('/api/recipes/:id', async (req, res) => {
    if (!(await store.remove(req.params.id))) {
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
