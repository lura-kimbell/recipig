import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../src/app.ts';
import { FetchError } from '../src/fetchPage.ts';
import { RecipeStore } from '../src/store.ts';
import { BLOG_PAGE, NO_RECIPE_PAGE } from './fixtures.ts';

async function withServer(
  fetchPage: (url: string) => Promise<{ html: string; finalUrl: string }>,
  run: (call: (method: string, url: string, body?: unknown) => Promise<{ status: number; json: any }>) => Promise<void>,
) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'recipig-app-'));
  const app = createApp(new RecipeStore(path.join(dir, 'recipes.json')), { fetchPage });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const call = async (method: string, url: string, body?: unknown) => {
    const res = await fetch(base + url, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : undefined };
  };

  try {
    await run(call);
  } finally {
    server.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
}

const okPage = async (url: string) => ({ html: BLOG_PAGE, finalUrl: url });

test('import, list, edit, check off an ingredient, and delete', async () => {
  await withServer(okPage, async (call) => {
    const imported = await call('POST', '/api/recipes/import', { url: 'https://blog.example.com/scramble' });
    assert.equal(imported.status, 201);
    const recipe = imported.json;
    assert.equal(recipe.title, 'Cheesy Scrambled Eggs');
    assert.equal(recipe.steps[1].ingredientIds.length, 2);

    const list = await call('GET', '/api/recipes');
    assert.equal(list.json.length, 1);

    // Tick the first ingredient and rename the recipe.
    recipe.ingredients[0].checked = true;
    recipe.title = 'Cheesy Eggs';
    const saved = await call('PUT', `/api/recipes/${recipe.id}`, recipe);
    assert.equal(saved.status, 200);
    assert.equal(saved.json.title, 'Cheesy Eggs');

    const reloaded = await call('GET', `/api/recipes/${recipe.id}`);
    assert.equal(reloaded.json.ingredients[0].checked, true);
    assert.deepEqual(reloaded.json.steps[1].ingredientIds, recipe.steps[1].ingredientIds);

    assert.equal((await call('DELETE', `/api/recipes/${recipe.id}`)).status, 204);
    assert.equal((await call('GET', `/api/recipes/${recipe.id}`)).status, 404);
  });
});

test('import reports problems with sensible status codes', async () => {
  await withServer(
    async (url) => {
      if (url.includes('missing')) throw new FetchError("Couldn't find that website.");
      return { html: NO_RECIPE_PAGE, finalUrl: url };
    },
    async (call) => {
      assert.equal((await call('POST', '/api/recipes/import', {})).status, 400);
      assert.equal((await call('POST', '/api/recipes/import', { url: 'https://x.example/page' })).status, 422);
      assert.equal((await call('POST', '/api/recipes/import', { url: 'https://missing.example/' })).status, 502);
    },
  );
});

test('rejects invalid recipe updates and unknown ids', async () => {
  await withServer(okPage, async (call) => {
    const { json: recipe } = await call('POST', '/api/recipes/import', { url: 'https://blog.example.com/scramble' });
    assert.equal((await call('PUT', `/api/recipes/${recipe.id}`, { title: '' })).status, 400);
    assert.equal((await call('PUT', '/api/recipes/nope', { title: 'x' })).status, 404);
    assert.equal((await call('GET', '/api/nope')).status, 404);
  });
});

test('create a recipe from scratch, with sections', async () => {
  await withServer(okPage, async (call) => {
    const created = await call('POST', '/api/recipes', {
      title: 'Toast',
      ingredients: [{ id: 'i1', text: '2 slices bread', section: 'Base' }],
      steps: [{ text: 'Toast the bread.', ingredientIds: ['i1'], section: 'Base' }],
    });
    assert.equal(created.status, 201);
    assert.ok(created.json.id);
    assert.equal(created.json.ingredients[0].section, 'Base');
    assert.equal(created.json.steps[0].section, 'Base');
    assert.deepEqual((await call('GET', `/api/recipes/${created.json.id}`)).json.steps[0].ingredientIds, ['i1']);

    // A title is all a recipe needs; the rest can be filled in later.
    assert.equal((await call('POST', '/api/recipes', { title: 'Blank' })).status, 201);
    assert.equal((await call('POST', '/api/recipes', { title: '  ' })).status, 400);
    assert.equal((await call('GET', '/api/recipes')).json.length, 2);
  });
});
