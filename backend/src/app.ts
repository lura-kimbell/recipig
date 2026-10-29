import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { extractRecipe, NoRecipeError } from './extract.ts';
import { fetchPage, FetchError, UrlError } from './fetchPage.ts';
import type { FetchedPage } from './fetchPage.ts';
import { AuthError, createAuth, currentUser, RateLimitError } from './authRoutes.ts';
import { looksLike, MAX_UPLOAD_BYTES, UPLOAD_TYPES, uploadedImageId, uploadedImageUrl } from './images.ts';
import type { UploadType } from './images.ts';
import { parseSourceInput } from './sources.ts';
import { SourceNameTakenError, UsernameTakenError } from './stores.ts';
import type { Stores } from './stores.ts';
import type { RecipeDraft } from './types.ts';
import { AttemptLimiter } from './rateLimit.ts';
import { claudePhotoReader, draftFromReading, PhotoReadError } from './photoImport.ts';
import type { PhotoReader, RecipePhoto } from './photoImport.ts';
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
  /**
   * Reads a recipe from photos of a cookbook (Claude, when ANTHROPIC_API_KEY is set).
   * null turns photo import off; tests pass a fake.
   */
  readPhotos?: PhotoReader | null;
  /** Swappable clock for tests. */
  now?: () => number;
}

/** Photos per recipe, and photo imports per person per day (each one is a paid API call). */
const MAX_PHOTOS = 6;
const PHOTO_IMPORTS_PER_DAY = 30;
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
/** Recipe photos uploaded per person per day, and how long an upload no recipe uses is kept. */
const IMAGE_UPLOADS_PER_DAY = 100;
const UNUSED_IMAGE_GRACE_MS = 24 * 60 * 60 * 1000;

function parsePhotos(body: unknown): RecipePhoto[] {
  const photos = (body as { photos?: unknown } | undefined)?.photos;
  if (!Array.isArray(photos) || photos.length === 0) throw new ValidationError('Please add at least one photo.');
  if (photos.length > MAX_PHOTOS) throw new ValidationError(`Up to ${MAX_PHOTOS} photos per recipe, please.`);
  return photos.map((p: { mediaType?: unknown; data?: unknown }) => {
    if (typeof p?.mediaType !== 'string' || !PHOTO_TYPES.has(p.mediaType) || typeof p.data !== 'string' || !p.data) {
      throw new ValidationError('Photos must be JPEG, PNG or WebP images.');
    }
    return { mediaType: p.mediaType as RecipePhoto['mediaType'], data: p.data };
  });
}

export function createApp(stores: Stores, options: AppOptions = {}) {
  const getPage = options.fetchPage ?? fetchPage;
  const readPhotos = options.readPhotos === undefined ? claudePhotoReader() : options.readPhotos;
  const photoLimiter = new AttemptLimiter(PHOTO_IMPORTS_PER_DAY, 24 * 60 * 60 * 1000, options.now);
  const uploadLimiter = new AttemptLimiter(IMAGE_UPLOADS_PER_DAY, 24 * 60 * 60 * 1000, options.now);
  const clock = options.now ?? Date.now;
  const { recipes: store, sources, images } = stores;

  /** Ids of the user's uploaded photos that some recipe uses. */
  const imagesInUse = async (userId: string): Promise<Set<string>> =>
    new Set((await store.list(userId)).flatMap((r) => uploadedImageId(r.image) ?? []));

  /** After a recipe stops using an uploaded photo, delete it unless another recipe still does. */
  const dropImageIfUnused = async (userId: string, image: string | undefined): Promise<void> => {
    const id = uploadedImageId(image);
    if (id && !(await imagesInUse(userId)).has(id)) await images.remove(userId, id);
  };

  /** A recipe may only point at one of its owner's own sources. */
  const checkSource = async (userId: string, draft: RecipeDraft): Promise<RecipeDraft> => {
    if (draft.sourceId && !(await sources.get(userId, draft.sourceId))) throw new ValidationError('That source no longer exists.');
    return draft;
  };
  const auth = createAuth(stores, { secureCookie: options.secureCookie, signupCode: options.signupCode, now: options.now });
  const app = express();
  if (options.trustProxy !== undefined) app.set('trust proxy', options.trustProxy);
  // Photos get a bigger allowance, but only once the user is known (see the photo import route).
  const json = express.json({ limit: '1mb' });
  const photoJson = express.json({ limit: '15mb' });
  app.use((req, res, next) => (req.path === '/api/recipes/import-photos' ? next() : json(req, res, next)));

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
    const userId = currentUser(res).id;
    res.status(201).json(await store.create(userId, await checkSource(userId, parseRecipeInput(req.body))));
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

  // Photos of a cookbook recipe, read by Claude. Returns an unsaved draft for the editor;
  // the photos themselves are not kept.
  app.post('/api/recipes/import-photos', photoJson, async (req, res) => {
    if (!readPhotos) throw new PhotoReadError("Importing from photos isn't set up on this server.", 503);
    const photos = parsePhotos(req.body);
    const userId = currentUser(res).id;
    if (photoLimiter.isBlocked(userId)) {
      throw new RateLimitError(`That's ${PHOTO_IMPORTS_PER_DAY} photo imports today. Please try again tomorrow.`);
    }
    photoLimiter.record(userId);
    res.json(draftFromReading(await readPhotos(photos)));
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
    const userId = currentUser(res).id;
    const before = await store.get(userId, req.params.id);
    const updated = before && (await store.update(userId, req.params.id, await checkSource(userId, parseRecipeInput(req.body))));
    if (!updated) {
      res.status(404).json({ error: 'Recipe not found.' });
      return;
    }
    if (before.image !== updated.image) await dropImageIfUnused(userId, before.image);
    res.json(updated);
  });

  app.delete('/api/recipes/:id', async (req, res) => {
    const userId = currentUser(res).id;
    const recipe = await store.get(userId, req.params.id);
    if (!recipe || !(await store.remove(userId, req.params.id))) {
      res.status(404).json({ error: 'Recipe not found.' });
      return;
    }
    await dropImageIfUnused(userId, recipe.image);
    res.status(204).end();
  });

  // Recipe photos from the cook's device (images.ts). The body is the image itself.
  app.use('/api/images', auth.requireUser);

  app.post(
    '/api/images',
    express.raw({ type: [...UPLOAD_TYPES], limit: MAX_UPLOAD_BYTES }),
    async (req, res) => {
      const type = req.headers['content-type']?.split(';')[0].trim().toLowerCase() as UploadType | undefined;
      const data: unknown = req.body;
      if (!type || !UPLOAD_TYPES.includes(type) || !Buffer.isBuffer(data) || !looksLike(type, data)) {
        throw new ValidationError('Please choose a JPEG, PNG or WebP photo.');
      }
      const userId = currentUser(res).id;
      if (uploadLimiter.isBlocked(userId)) throw new RateLimitError("That's a lot of photos for one day. Please try again tomorrow.");
      uploadLimiter.record(userId);
      // Photos uploaded but never saved on a recipe (the editor was left without saving) go after a day.
      await images.sweep(userId, await imagesInUse(userId), new Date(clock() - UNUSED_IMAGE_GRACE_MS));
      const id = await images.create(userId, { contentType: type, data });
      res.status(201).json({ url: uploadedImageUrl(id) });
    },
  );

  app.get('/api/images/:id', async (req, res) => {
    const image = await images.get(currentUser(res).id, req.params.id);
    if (!image) {
      res.status(404).json({ error: 'Image not found.' });
      return;
    }
    // An id always shows the same photo, so the browser can keep it (but only for this person).
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type(image.contentType).send(image.data);
  });

  // Sources: the cook's own labels for where recipes come from (sources.ts).
  app.use('/api/sources', auth.requireUser);

  app.get('/api/sources', async (_req, res) => {
    res.json(await sources.list(currentUser(res).id));
  });

  app.post('/api/sources', async (req, res) => {
    res.status(201).json(await sources.create(currentUser(res).id, parseSourceInput(req.body)));
  });

  app.put('/api/sources/:id', async (req, res) => {
    const updated = await sources.update(currentUser(res).id, req.params.id, parseSourceInput(req.body));
    if (!updated) {
      res.status(404).json({ error: 'Source not found.' });
      return;
    }
    res.json(updated);
  });

  // Deleting a source takes it off its recipes; the recipes themselves stay.
  app.delete('/api/sources/:id', async (req, res) => {
    const userId = currentUser(res).id;
    if (!(await sources.remove(userId, req.params.id))) {
      res.status(404).json({ error: 'Source not found.' });
      return;
    }
    await store.clearSource(userId, req.params.id);
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
    } else if (err instanceof UsernameTakenError || err instanceof SourceNameTakenError) {
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
    } else if (err instanceof PhotoReadError) {
      status = err.status;
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
