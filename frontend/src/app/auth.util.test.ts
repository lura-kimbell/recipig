import assert from 'node:assert/strict';
import test from 'node:test';
import { safeReturnUrl } from './auth.util.ts';

test('keeps same-site paths', () => {
  assert.equal(safeReturnUrl('/recipes/abc'), '/recipes/abc');
  assert.equal(safeReturnUrl('/recipes/abc/edit?x=1#top'), '/recipes/abc/edit?x=1#top');
  assert.equal(safeReturnUrl('/import'), '/import');
});

test('refuses anything that could leave the site', () => {
  for (const bad of ['https://evil.example', 'http://evil.example/x', '//evil.example', '/\\evil.example', 'javascript:alert(1)', 'recipes/abc', '', '/a\nb', '/a\u0000b']) {
    assert.equal(safeReturnUrl(bad), '/', JSON.stringify(bad));
  }
});

test('falls back to home for missing or odd values and for the login pages', () => {
  for (const odd of [undefined, null, 5, ['/x'], {}, '/login', '/register', '/login?returnUrl=/x', '/register#a']) {
    assert.equal(safeReturnUrl(odd), '/');
  }
  assert.equal(safeReturnUrl('/loginfoo'), '/loginfoo');
});
