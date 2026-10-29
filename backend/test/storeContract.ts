import assert from 'node:assert/strict';
import test from 'node:test';
import { SourceNameTakenError, UsernameTakenError } from '../src/stores.ts';
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

  t("a user's theme is saved and comes back with the user", async ({ users }) => {
    const a = await users.create('Alice', 'hash');
    assert.equal((await users.findById(a.id))?.theme, undefined);
    assert.equal(await users.setTheme(a.id, 'aurora'), true);
    assert.equal((await users.findById(a.id))?.theme, 'aurora');
    assert.equal((await users.findByUsername('alice'))?.theme, 'aurora');
    assert.equal(await users.setTheme('nope', 'terminal'), false);
  });

  t('the themes a user hides photos in are saved and come back with the user', async ({ users }) => {
    const a = await users.create('Alice', 'hash');
    assert.equal((await users.findById(a.id))?.hideImagesIn, undefined);
    assert.equal(await users.setHideImagesIn(a.id, ['aurora', 'terminal']), true);
    assert.deepEqual((await users.findById(a.id))?.hideImagesIn, ['aurora', 'terminal']);
    assert.equal(await users.setHideImagesIn(a.id, []), true);
    assert.deepEqual((await users.findByUsername('alice'))?.hideImagesIn, []);
    assert.equal(await users.setHideImagesIn('nope', ['aurora']), false);
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
    const created = await recipes.create('u1', draft('Old', { servings: '4', sourceUrl: 'https://x.example/', sourceId: 'src-1', notes: 'n', tags: ['Chicken'] }));
    await new Promise((r) => setTimeout(r, 5));
    const updated = await recipes.update('u1', created.id, draft('New', { ingredients: [{ id: 'i9', text: '1 cup milk', checked: true, section: 'Wet' }] }));
    assert.equal(updated?.id, created.id);
    assert.equal(updated?.createdAt, created.createdAt);
    assert.notEqual(updated?.updatedAt, created.updatedAt);
    assert.equal(updated?.title, 'New');
    assert.equal('servings' in (updated ?? {}), false);
    assert.equal('sourceUrl' in (updated ?? {}), false);
    assert.equal('sourceId' in (updated ?? {}), false);
    assert.equal('tags' in (updated ?? {}), false);
    assert.equal('notes' in (updated ?? {}), false);

    const reloaded = await recipes.get('u1', created.id);
    assert.deepEqual(reloaded, updated);
    assert.equal(reloaded?.ingredients[0].section, 'Wet');
    assert.equal(reloaded?.ingredients[0].checked, true);
  });

  t('old step notes are moved into the recipe notes when read', async ({ recipes }) => {
    const created = await recipes.create('u1', draft('Old notes', { notes: 'Good with rice.' }));
    const legacy = {
      ...created,
      id: 'legacy-1',
      steps: [
        { id: 's1', text: 'Whisk.', ingredientIds: [], notes: '  Whisk longer. ' },
        { id: 's2', text: 'Cook.', ingredientIds: [], notes: '   ' },
        { id: 's3', text: 'Serve.', ingredientIds: [] },
      ],
    };
    assert.equal(await recipes.restore('u1', legacy as never), true);
    const read = await recipes.get('u1', 'legacy-1');
    assert.equal(read?.notes, 'Good with rice.\n\nStep 1: Whisk longer.');
    assert.ok(read?.steps.every((s) => !('notes' in s)));
    assert.equal((await recipes.list('u1')).find((r) => r.id === 'legacy-1')?.notes, read?.notes);
  });

  t('an old free-text source is moved into the notes when read, and dropped on save', async ({ recipes }) => {
    const created = await recipes.create('u1', draft('Book recipe', { notes: 'Lovely.' }));
    assert.equal(await recipes.restore('u1', { ...created, id: 'legacy-2', source: ' The Roasting Tin, p. 48 ' } as never), true);
    const read = await recipes.get('u1', 'legacy-2');
    assert.equal(read?.notes, 'Lovely.\n\nSource: The Roasting Tin, p. 48');
    assert.equal('source' in (read ?? {}), false);
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = read!;
    const saved = await recipes.update('u1', 'legacy-2', rest);
    assert.equal(saved?.notes, read?.notes);
    assert.equal('source' in ((await recipes.get('u1', 'legacy-2')) ?? {}), false);
  });

  t('clearSource takes a source off only that user’s recipes that have it', async ({ recipes }) => {
    const a = await recipes.create('u1', draft('A', { sourceId: 'book' }));
    const b = await recipes.create('u1', draft('B', { sourceId: 'paper' }));
    const c = await recipes.create('u2', draft('C', { sourceId: 'book' }));
    await recipes.clearSource('u1', 'book');
    assert.equal((await recipes.get('u1', a.id))?.sourceId, undefined);
    assert.equal((await recipes.get('u1', b.id))?.sourceId, 'paper');
    assert.equal((await recipes.get('u2', c.id))?.sourceId, 'book');
  });

  t('sources: names unique per user ignoring case, listed by name, private to their user', async ({ sources }) => {
    const nyt = await sources.create('u1', { name: 'NY Times', icon: 'news' });
    await sources.create('u1', { name: 'ottolenghi Simple', icon: 'book' });
    await sources.create('u1', { name: 'Grandma', icon: 'home' });
    await assert.rejects(sources.create('u1', { name: 'ny times', icon: 'globe' }), SourceNameTakenError);
    await sources.create('u2', { name: 'NY Times', icon: 'globe' });
    assert.deepEqual((await sources.list('u1')).map((s) => s.name), ['Grandma', 'NY Times', 'ottolenghi Simple']);
    assert.deepEqual(await sources.get('u1', nyt.id), { id: nyt.id, name: 'NY Times', icon: 'news' });
    assert.equal(await sources.get('u2', nyt.id), undefined);

    assert.deepEqual(await sources.update('u1', nyt.id, { name: 'New York Times', icon: 'globe' }), { id: nyt.id, name: 'New York Times', icon: 'globe' });
    await assert.rejects(sources.update('u1', nyt.id, { name: 'GRANDMA', icon: 'globe' }), SourceNameTakenError);
    assert.ok(await sources.update('u1', nyt.id, { name: 'new york times', icon: 'globe' }));
    assert.equal(await sources.update('u2', nyt.id, { name: 'Mine', icon: 'globe' }), undefined);

    assert.equal(await sources.remove('u2', nyt.id), false);
    assert.equal(await sources.remove('u1', nyt.id), true);
    assert.equal(await sources.get('u1', nyt.id), undefined);
  });

  t('images: kept per user, removable, and swept unless kept or recent', async ({ images }) => {
    const photo = { contentType: 'image/jpeg' as const, data: Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]) };
    const a = await images.create('u1', photo);
    const b = await images.create('u1', photo);
    const c = await images.create('u2', photo);
    assert.deepEqual(await images.get('u1', a), photo);
    assert.equal(await images.get('u2', a), undefined);

    // Nothing older than "an hour ago" yet, so nothing goes.
    assert.equal(await images.sweep('u1', new Set(), new Date(Date.now() - 3600_000)), 0);
    assert.equal(await images.sweep('u1', new Set([a]), new Date(Date.now() + 1000)), 1);
    assert.ok(await images.get('u1', a));
    assert.equal(await images.get('u1', b), undefined);
    assert.ok(await images.get('u2', c));

    assert.equal(await images.remove('u2', a), false);
    assert.equal(await images.remove('u1', a), true);
    assert.equal(await images.get('u1', a), undefined);
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
