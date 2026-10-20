import assert from 'node:assert/strict';
import test from 'node:test';
import { UsernameTakenError } from '../src/stores.ts';
import type { Stores } from '../src/stores.ts';
import type { RecipeDraft } from '../src/types.ts';

const draft = (title: string, extra: Partial<RecipeDraft> = {}): RecipeDraft => ({
  title,
  ingredients: [{ id: 'i1', text: '2 eggs', checked: false }],
  steps: [{ id: 's1', text: 'Whisk the eggs.', ingredientIds: ['i1'] }],
  ...extra,
});

/** The same behaviour is required of the in-memory stores and the MongoDB ones. */
export function runStoreContract(name: string, open: () => Promise<{ stores: Stores; close?: () => Promise<void> }>, skip?: string) {
  const t = (title: string, fn: (stores: Stores) => Promise<void>) =>
    test(`${name}: ${title}`, { skip }, async () => {
      const { stores, close } = await open();
      try {
        await fn(stores);
      } finally {
        await close?.();
      }
    });

  t('usernames are unique, ignoring case, and can be found any way they are typed', async ({ users }) => {
    const a = await users.create('Alice', 'hash');
    await assert.rejects(users.create('alice', 'other'), UsernameTakenError);
    assert.equal((await users.findByUsername('ALICE'))?.id, a.id);
    assert.equal((await users.findByUsername('Alice'))?.username, 'Alice');
    assert.equal((await users.findById(a.id))?.passwordHash, 'hash');
    assert.equal(await users.findByUsername('bob'), undefined);
    assert.equal(await users.findById('nope'), undefined);
  });

  t('sessions can be created, found, and deleted', async ({ sessions }) => {
    const expiresAt = new Date(Date.now() + 60_000);
    await sessions.create('hash1', 'user1', expiresAt);
    const found = await sessions.find('hash1');
    assert.equal(found?.userId, 'user1');
    assert.equal(found?.expiresAt.getTime(), expiresAt.getTime());
    await sessions.delete('hash1');
    assert.equal(await sessions.find('hash1'), undefined);
    await sessions.delete('hash1'); // deleting twice is fine
  });

  t('recipes belong to their owner', async ({ recipes }) => {
    const mine = await recipes.create('u1', draft('Mine', { servings: '4' }));
    const theirs = await recipes.create('u2', draft('Theirs'));
    assert.ok(mine.id && mine.createdAt && mine.updatedAt);
    assert.equal(mine.servings, '4');

    assert.deepEqual((await recipes.list('u1')).map((r) => r.title), ['Mine']);
    assert.equal((await recipes.get('u1', mine.id))?.title, 'Mine');
    assert.equal(await recipes.get('u1', theirs.id), undefined);
    assert.equal(await recipes.update('u1', theirs.id, draft('Hijacked')), undefined);
    assert.equal(await recipes.remove('u1', theirs.id), false);
    assert.equal((await recipes.get('u2', theirs.id))?.title, 'Theirs');
  });

  t('lists newest first', async ({ recipes }) => {
    await recipes.create('u1', draft('First'));
    await new Promise((r) => setTimeout(r, 5));
    await recipes.create('u1', draft('Second'));
    assert.deepEqual((await recipes.list('u1')).map((r) => r.title), ['Second', 'First']);
  });

  t('update keeps id and createdAt, replaces the rest, and clears optional fields left out', async ({ recipes }) => {
    const created = await recipes.create('u1', draft('Old', { servings: '4', sourceUrl: 'https://x.example/' }));
    await new Promise((r) => setTimeout(r, 5));
    const updated = await recipes.update('u1', created.id, draft('New', { ingredients: [{ id: 'i9', text: '1 cup milk', checked: true, section: 'Wet' }] }));
    assert.equal(updated?.id, created.id);
    assert.equal(updated?.createdAt, created.createdAt);
    assert.notEqual(updated?.updatedAt, created.updatedAt);
    assert.equal(updated?.title, 'New');
    assert.equal('servings' in (updated ?? {}), false);
    assert.equal('sourceUrl' in (updated ?? {}), false);

    const reloaded = await recipes.get('u1', created.id);
    assert.deepEqual(reloaded, updated);
    assert.equal(reloaded?.ingredients[0].section, 'Wet');
    assert.equal(reloaded?.ingredients[0].checked, true);
  });

  t('remove deletes only that recipe', async ({ recipes }) => {
    const a = await recipes.create('u1', draft('A'));
    await recipes.create('u1', draft('B'));
    assert.equal(await recipes.remove('u1', a.id), true);
    assert.equal(await recipes.remove('u1', a.id), false);
    assert.deepEqual((await recipes.list('u1')).map((r) => r.title), ['B']);
  });

  t('restore keeps the original id and dates, and never overwrites', async ({ recipes }) => {
    const original = { ...draft('Old'), id: 'old-id', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-02-02T00:00:00.000Z' };
    assert.equal(await recipes.restore('u1', original), true);
    assert.equal(await recipes.restore('u1', { ...original, title: 'Changed' }), false);
    assert.equal(await recipes.restore('u2', original), false);
    assert.deepEqual(await recipes.get('u1', 'old-id'), original);
  });
}
