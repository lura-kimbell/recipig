import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { RecipeStore } from '../src/store.ts';
import type { RecipeDraft } from '../src/types.ts';

const draft = (title: string): RecipeDraft => ({
  title,
  ingredients: [{ id: 'i1', text: '2 eggs', checked: false }],
  steps: [{ id: 's1', text: 'Mix the eggs.', ingredientIds: ['i1'] }],
});

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'recipig-'));
  const file = path.join(dir, 'nested', 'recipes.json');
  return { file, store: new RecipeStore(file), cleanup: () => fs.rm(dir, { recursive: true, force: true }) };
}

test('create, get, update, list and remove', async () => {
  const { store, cleanup } = await tempStore();
  try {
    assert.deepEqual(await store.list(), []);

    const a = await store.create(draft('A'));
    assert.ok(a.id);
    assert.equal((await store.get(a.id))?.title, 'A');

    const updated = await store.update(a.id, { ...draft('A2'), ingredients: [{ id: 'i1', text: '2 eggs', checked: true }] });
    assert.equal(updated?.title, 'A2');
    assert.equal(updated?.ingredients[0].checked, true);
    assert.equal(updated?.createdAt, a.createdAt);

    assert.equal(await store.update('missing', draft('x')), undefined);

    await store.create(draft('B'));
    assert.equal((await store.list()).length, 2);

    assert.equal(await store.remove(a.id), true);
    assert.equal(await store.remove(a.id), false);
    assert.equal((await store.list()).length, 1);
  } finally {
    await cleanup();
  }
});

test('data survives a restart (new store instance on the same file)', async () => {
  const { file, store, cleanup } = await tempStore();
  try {
    const created = await store.create(draft('Persisted'));
    const reopened = new RecipeStore(file);
    assert.equal((await reopened.get(created.id))?.title, 'Persisted');
  } finally {
    await cleanup();
  }
});

test('concurrent writes are not lost', async () => {
  const { store, cleanup } = await tempStore();
  try {
    await Promise.all(Array.from({ length: 20 }, (_, i) => store.create(draft(`R${i}`))));
    assert.equal((await store.list()).length, 20);
  } finally {
    await cleanup();
  }
});
