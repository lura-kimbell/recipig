import assert from 'node:assert/strict';
import test from 'node:test';
import { errorForStatus, fetchPage, isPrivateAddress, UrlError } from '../src/fetchPage.ts';

test('isPrivateAddress flags non-public addresses', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1']) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
});

test('isPrivateAddress allows public addresses', () => {
  for (const ip of ['8.8.8.8', '93.184.216.34', '172.32.0.1', '2606:4700:4700::1111']) {
    assert.equal(isPrivateAddress(ip), false, ip);
  }
});

test('fetchPage refuses unusable or non-public URLs without making a request', async () => {
  for (const url of ['not a url', 'ftp://example.com/x', 'http://127.0.0.1/', 'http://[::1]/', 'http://169.254.169.254/latest/meta-data', 'http://user:pw@example.com/']) {
    await assert.rejects(() => fetchPage(url), UrlError, url);
  }
});

test('a 401/403 or a Cloudflare challenge reads as the site blocking the importer', () => {
  assert.equal(errorForStatus(403, new Headers()).blocked, true);
  assert.equal(errorForStatus(401, new Headers()).blocked, true);
  assert.equal(errorForStatus(503, new Headers({ 'cf-mitigated': 'challenge' })).blocked, true);
  const other = errorForStatus(500, new Headers());
  assert.equal(other.blocked, false);
  assert.match(other.message, /\(500\)/);
});
