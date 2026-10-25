import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLogin, parseRegistration } from '../src/credentials.ts';
import { hashPassword, verifyPassword } from '../src/password.ts';
import { AttemptLimiter } from '../src/rateLimit.ts';
import { clearedSessionCookie, hashToken, newSessionToken, parseCookies, sessionCookie } from '../src/session.ts';
import { toPublicUser } from '../src/stores.ts';
import { ValidationError } from '../src/validate.ts';

test('passwords are hashed, salted, and verified', async () => {
  const a = await hashPassword('hunter2');
  const b = await hashPassword('hunter2');
  assert.match(a, /^scrypt\$16384\$8\$1\$/);
  assert.notEqual(a, b); // different salt each time
  assert.ok(!a.includes('hunter2'));
  assert.equal(await verifyPassword('hunter2', a), true);
  assert.equal(await verifyPassword('hunter3', a), false);
  assert.equal(await verifyPassword('', a), false);
  assert.equal(await verifyPassword('  spaces  ', await hashPassword('  spaces  ')), true);
});

test('garbled stored hashes just fail to verify', async () => {
  for (const bad of ['', 'plain', 'scrypt$1$2$3$4', 'scrypt$x$8$1$AAAA$AAAA', 'bcrypt$16384$8$1$AAAA$AAAA', 'scrypt$999999999$8$1$AAAA$AAAA']) {
    assert.equal(await verifyPassword('pw', bad), false);
  }
});

test('registration rules: username shape, any non-empty password', () => {
  assert.deepEqual(parseRegistration({ username: '  Lura_k.1-x ', password: ' p w ' }), { username: 'Lura_k.1-x', password: ' p w ' });
  for (const username of ['ab', 'a'.repeat(31), 'has space', 'émile', 'a/b', '']) {
    assert.throws(() => parseRegistration({ username, password: 'x' }), ValidationError, username);
  }
  assert.throws(() => parseRegistration({ username: 'okname', password: '' }), ValidationError);
  assert.throws(() => parseRegistration({ username: 'okname', password: 'x'.repeat(501) }), ValidationError);
  assert.throws(() => parseRegistration({ username: 'okname' }), ValidationError);
  assert.throws(() => parseRegistration(null), ValidationError);
  assert.throws(() => parseRegistration({ username: { $ne: '' }, password: 'x' }), ValidationError);
});

test('login only needs something in both boxes', () => {
  assert.deepEqual(parseLogin({ username: ' a ', password: 'x' }), { username: 'a', password: 'x' });
  assert.throws(() => parseLogin({ username: '  ', password: 'x' }), ValidationError);
  assert.throws(() => parseLogin({ username: 'a', password: '' }), ValidationError);
  assert.throws(() => parseLogin({ username: ['a'], password: 'x' }), ValidationError);
});

test('attempt limiter blocks after the maximum and recovers when the window passes', () => {
  let t = 0;
  const limiter = new AttemptLimiter(3, 1000, () => t);
  for (let i = 0; i < 3; i++) {
    assert.equal(limiter.isBlocked('k'), false);
    limiter.record('k');
  }
  assert.equal(limiter.isBlocked('k'), true);
  assert.equal(limiter.isBlocked('other'), false);
  t = 1001;
  assert.equal(limiter.isBlocked('k'), false);
  limiter.record('k');
  limiter.reset('k');
  assert.equal(limiter.isBlocked('k'), false);
});

test('session tokens are random and only their hash is meant to be stored', () => {
  const a = newSessionToken();
  const b = newSessionToken();
  assert.notEqual(a.token, b.token);
  assert.ok(a.token.length >= 43);
  assert.equal(a.hash, hashToken(a.token));
  assert.notEqual(a.hash, a.token);
});

test('cookie parsing and cookie flags', () => {
  assert.deepEqual(parseCookies('a=1; recipig_session=abc%20d; b'), { a: '1', recipig_session: 'abc d' });
  assert.deepEqual(parseCookies(undefined), {});
  assert.deepEqual(parseCookies('x=%E0%A4%A'), { x: '%E0%A4%A' }); // bad escapes don't throw
  const set = sessionCookie('tok', false);
  assert.match(set, /HttpOnly/);
  assert.match(set, /SameSite=Lax/);
  assert.doesNotMatch(set, /Secure/);
  assert.match(sessionCookie('tok', true), /; Secure$/);
  assert.match(clearedSessionCookie(false), /Max-Age=0/);
});

test('a saved theme that no longer exists falls back to the default', () => {
  const user = { id: 'u1', username: 'a', passwordHash: 'h', createdAt: '' };
  assert.equal(toPublicUser({ ...user, theme: 'terminal' }).theme, 'terminal');
  assert.equal(toPublicUser({ ...user, theme: 'sanguine' as never }).theme, 'friendly');
  assert.equal(toPublicUser(user).theme, 'friendly');
});
