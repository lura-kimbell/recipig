import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createApp } from '../src/app.ts';
import { FetchError } from '../src/fetchPage.ts';
import { createMemoryStores } from '../src/memoryStores.ts';
import type { PhotoReader } from '../src/photoImport.ts';
import { BLOG_PAGE, NO_RECIPE_PAGE } from './fixtures.ts';

type Reply = { status: number; json: any; headers: Headers };
type Call = (method: string, url: string, body?: unknown) => Promise<Reply>;

/** A tiny browser: remembers cookies between calls. */
function makeClient(base: string): Call {
  let cookie = '';
  return async (method, url, body) => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (cookie) headers.cookie = cookie;
    const res = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const set of res.headers.getSetCookie()) {
      const pair = set.split(';')[0];
      const [name, value] = pair.split('=');
      cookie = value === '' ? '' : `${name}=${value}`;
    }
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : undefined, headers: res.headers };
  };
}

async function withServer(
  fetchPage: (url: string) => Promise<{ html: string; finalUrl: string }>,
  run: (call: Call, newClient: () => Call) => Promise<void>,
  options: { now?: () => number; signupCode?: string; readPhotos?: PhotoReader | null } = {},
) {
  const app = createApp(createMemoryStores(), {
    fetchPage,
    now: options.now,
    signupCode: options.signupCode,
    readPhotos: options.readPhotos ?? null,
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const newClient = () => makeClient(base);

  // Most tests just need someone logged in.
  const call = newClient();
  const registered = await call('POST', '/api/auth/register', { username: 'alice', password: 'pw', inviteCode: options.signupCode });
  assert.equal(registered.status, 201);

  try {
    await run(call, newClient);
  } finally {
    server.close();
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

test('creating an account logs you in; usernames are unique regardless of case', async () => {
  await withServer(okPage, async (alice, newClient) => {
    const me = await alice('GET', '/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.json.username, 'alice');
    assert.equal(me.json.passwordHash, undefined);

    const other = newClient();
    assert.equal((await other('POST', '/api/auth/register', { username: 'ALICE', password: 'x' })).status, 409);
    assert.equal((await other('POST', '/api/auth/register', { username: 'a', password: 'x' })).status, 400);
    assert.equal((await other('POST', '/api/auth/register', { username: 'bobby', password: '' })).status, 400);
    assert.equal((await other('POST', '/api/auth/register', { username: 'bobby', password: ' any thing at all ' })).status, 201);
  });
});

test('log in, log out, and wrong passwords', async () => {
  await withServer(okPage, async (alice, newClient) => {
    assert.equal((await alice('POST', '/api/auth/logout')).status, 204);
    assert.equal((await alice('GET', '/api/auth/me')).status, 401);
    assert.equal((await alice('GET', '/api/recipes')).status, 401);

    const again = newClient();
    const bad = await again('POST', '/api/auth/login', { username: 'alice', password: 'nope' });
    assert.equal(bad.status, 401);
    const unknown = await again('POST', '/api/auth/login', { username: 'nobody', password: 'nope' });
    assert.equal(unknown.status, 401);
    assert.equal(bad.json.error, unknown.json.error); // doesn't reveal which usernames exist

    assert.equal((await again('POST', '/api/auth/login', { username: 'Alice', password: 'pw' })).status, 200);
    assert.equal((await again('GET', '/api/recipes')).status, 200);
  });
});

test('every recipe route needs a login, and nobody sees anyone else\'s recipes', async () => {
  await withServer(okPage, async (alice, newClient) => {
    const { json: recipe } = await alice('POST', '/api/recipes/import', { url: 'https://blog.example.com/scramble' });

    const nobody = newClient();
    assert.equal((await nobody('GET', '/api/recipes')).status, 401);
    assert.equal((await nobody('POST', '/api/recipes', { title: 'x' })).status, 401);
    assert.equal((await nobody('POST', '/api/recipes/import', { url: 'https://blog.example.com/scramble' })).status, 401);
    assert.equal((await nobody('GET', `/api/recipes/${recipe.id}`)).status, 401);

    const bob = newClient();
    await bob('POST', '/api/auth/register', { username: 'bob', password: 'pw' });
    assert.deepEqual((await bob('GET', '/api/recipes')).json, []);
    assert.equal((await bob('GET', `/api/recipes/${recipe.id}`)).status, 404);
    assert.equal((await bob('PUT', `/api/recipes/${recipe.id}`, { ...recipe, title: 'Mine now' })).status, 404);
    assert.equal((await bob('DELETE', `/api/recipes/${recipe.id}`)).status, 404);

    // Bob's attempts changed nothing for Alice.
    const still = await alice('GET', `/api/recipes/${recipe.id}`);
    assert.equal(still.json.title, 'Cheesy Scrambled Eggs');
    assert.equal((await alice('GET', '/api/recipes')).json.length, 1);
  });
});

test('API responses are not cacheable', async () => {
  await withServer(okPage, async (alice) => {
    assert.equal((await alice('GET', '/api/recipes')).headers.get('cache-control'), 'no-store');
  });
});

test('too many wrong passwords are blocked for a while', async () => {
  let clock = 1_000_000;
  await withServer(
    okPage,
    async (_alice, newClient) => {
      const guesser = newClient();
      for (let i = 0; i < 10; i++) {
        assert.equal((await guesser('POST', '/api/auth/login', { username: 'alice', password: 'wrong' + i })).status, 401);
      }
      // Even the right password is refused now.
      assert.equal((await guesser('POST', '/api/auth/login', { username: 'alice', password: 'pw' })).status, 429);
      clock += 16 * 60 * 1000;
      assert.equal((await guesser('POST', '/api/auth/login', { username: 'alice', password: 'pw' })).status, 200);
    },
    { now: () => clock },
  );
});

test('sessions expire', async () => {
  let clock = 1_000_000;
  await withServer(
    okPage,
    async (alice) => {
      assert.equal((await alice('GET', '/api/auth/me')).status, 200);
      clock += 31 * 24 * 60 * 60 * 1000;
      assert.equal((await alice('GET', '/api/auth/me')).status, 401);
    },
    { now: () => clock },
  );
});

test('with an invite code set, only people who have it can create an account', async () => {
  await withServer(
    okPage,
    async (_alice, newClient) => {
      const visitor = newClient();
      assert.deepEqual((await visitor('GET', '/api/auth/signup')).json, { inviteCodeRequired: true });
      assert.equal((await visitor('POST', '/api/auth/register', { username: 'bob', password: 'pw' })).status, 400);
      assert.equal((await visitor('POST', '/api/auth/register', { username: 'bob', password: 'pw', inviteCode: 'nope' })).status, 400);
      assert.equal((await visitor('GET', '/api/auth/me')).status, 401);
      assert.equal((await visitor('POST', '/api/auth/register', { username: 'bob', password: 'pw', inviteCode: ' oink-oink ' })).status, 201);
    },
    { signupCode: 'oink-oink' },
  );
});

test('without an invite code set, anyone can sign up', async () => {
  await withServer(okPage, async (_alice, newClient) => {
    assert.deepEqual((await newClient()('GET', '/api/auth/signup')).json, { inviteCodeRequired: false });
  });
});

test("each person's theme is saved on their account", async () => {
  await withServer(okPage, async (alice, newClient) => {
    assert.equal((await alice('GET', '/api/auth/me')).json.theme, 'friendly');
    const saved = await alice('PUT', '/api/auth/theme', { theme: 'terminal' });
    assert.equal(saved.status, 200);
    assert.equal(saved.json.theme, 'terminal');
    assert.equal((await alice('GET', '/api/auth/me')).json.theme, 'terminal');
    assert.equal((await alice('PUT', '/api/auth/theme', { theme: 'neon' })).status, 400);
    assert.equal((await newClient()('PUT', '/api/auth/theme', { theme: 'aurora' })).status, 401);
  });
});

test("hiding photos is saved per theme and doesn't change with the theme", async () => {
  await withServer(okPage, async (alice, newClient) => {
    // Until changed, photos are hidden in Terminal only.
    assert.deepEqual((await alice('GET', '/api/auth/me')).json.hideImagesIn, ['terminal']);
    const saved = await alice('PUT', '/api/auth/hide-images', { themes: ['terminal', 'aurora', 'aurora'] });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.json.hideImagesIn, ['aurora', 'terminal']);
    await alice('PUT', '/api/auth/theme', { theme: 'friendly' });
    assert.deepEqual((await alice('GET', '/api/auth/me')).json.hideImagesIn, ['aurora', 'terminal']);
    assert.equal((await alice('PUT', '/api/auth/hide-images', { themes: ['neon'] })).status, 400);
    assert.equal((await alice('PUT', '/api/auth/hide-images', { themes: 'aurora' })).status, 400);
    assert.equal((await newClient()('PUT', '/api/auth/hide-images', { themes: [] })).status, 401);
    // Turning everything off sticks; it doesn't fall back to the default.
    await alice('PUT', '/api/auth/hide-images', { themes: [] });
    assert.deepEqual((await alice('GET', '/api/auth/me')).json.hideImagesIn, []);
  });
});

const PHOTO = { mediaType: 'image/jpeg', data: 'aGVsbG8=' };

const cookbookReading = {
  found: true,
  title: 'Lemon Chicken Traybake',
  servings: 'Serves 4',
  prepTime: '10 min',
  cookTime: '45 min',
  totalTime: null,
  ingredients: [
    { text: '8 chicken thighs', section: null },
    { text: '2 lemons', section: null },
    { text: '  1 tbsp   olive oil ', section: null },
  ],
  steps: [
    { text: 'Heat the oven to 200C.', section: null },
    { text: 'Toss the chicken thighs with the olive oil and lemons, then roast.', section: null },
  ],
};

test('photo import reads the photos into an unsaved draft for the editor', async () => {
  let seen: unknown[] = [];
  const readPhotos: PhotoReader = async (photos) => {
    seen = photos;
    return cookbookReading;
  };
  await withServer(okPage, async (call) => {
    const res = await call('POST', '/api/recipes/import-photos', { photos: [PHOTO, { ...PHOTO, mediaType: 'image/png' }] });
    assert.equal(res.status, 200);
    assert.equal(seen.length, 2);
    const draft = res.json;
    assert.equal(draft.title, 'Lemon Chicken Traybake');
    assert.equal(draft.servings, 'Serves 4');
    assert.equal(draft.totalTime, undefined);
    assert.deepEqual(draft.tags, ['Chicken']);
    assert.equal(draft.ingredients[2].text, '1 tbsp olive oil');
    assert.equal(draft.steps[1].ingredientIds.length, 3);
    assert.equal(draft.id, undefined);
    // Nothing is saved until the cook saves it from the editor.
    assert.equal((await call('GET', '/api/recipes')).json.length, 0);
  }, { readPhotos });
});

test('photo import checks the photos, needs a login, and says when nothing was found', async () => {
  const readPhotos: PhotoReader = async () => ({ ...cookbookReading, found: false, ingredients: [], steps: [] });
  await withServer(okPage, async (call, newClient) => {
    assert.equal((await call('POST', '/api/recipes/import-photos', { photos: [] })).status, 400);
    assert.equal((await call('POST', '/api/recipes/import-photos', { photos: [{ mediaType: 'image/gif', data: 'x' }] })).status, 400);
    assert.equal((await call('POST', '/api/recipes/import-photos', { photos: Array(7).fill(PHOTO) })).status, 400);
    assert.equal((await newClient()('POST', '/api/recipes/import-photos', { photos: [PHOTO] })).status, 401);
    const none = await call('POST', '/api/recipes/import-photos', { photos: [PHOTO] });
    assert.equal(none.status, 422);
    assert.match(none.json.error, /photos/);
  }, { readPhotos });
});

test('photo import accepts photo-sized requests but other routes keep the small limit', async () => {
  const readPhotos: PhotoReader = async () => cookbookReading;
  const big = 'A'.repeat(3 * 1024 * 1024);
  await withServer(okPage, async (call) => {
    assert.equal((await call('POST', '/api/recipes/import-photos', { photos: [{ ...PHOTO, data: big }] })).status, 200);
    assert.equal((await call('POST', '/api/recipes', { title: big, ingredients: [], steps: [] })).status, 413);
  }, { readPhotos });
});

test('photo import is limited per person per day, and off without a reader', async () => {
  let clock = 0;
  const readPhotos: PhotoReader = async () => cookbookReading;
  await withServer(okPage, async (call) => {
    for (let i = 0; i < 30; i++) assert.equal((await call('POST', '/api/recipes/import-photos', { photos: [PHOTO] })).status, 200);
    assert.equal((await call('POST', '/api/recipes/import-photos', { photos: [PHOTO] })).status, 429);
    clock += 24 * 60 * 60 * 1000 + 1;
    assert.equal((await call('POST', '/api/recipes/import-photos', { photos: [PHOTO] })).status, 200);
  }, { readPhotos, now: () => clock });

  await withServer(okPage, async (call) => {
    const off = await call('POST', '/api/recipes/import-photos', { photos: [PHOTO] });
    assert.equal(off.status, 503);
    assert.match(off.json.error, /isn't set up/);
  });
});
