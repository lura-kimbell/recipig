import dns from 'node:dns/promises';
import net from 'node:net';

/** The URL the user gave is unusable (bad syntax, wrong scheme, or not a public address). */
export class UrlError extends Error {}
/** The page could not be downloaded. */
export class FetchError extends Error {}

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 10_000;

function isPrivateV4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    a >= 224 // multicast and reserved
  );
}

/** True for loopback, private, link-local and other non-public addresses. */
export function isPrivateAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return isPrivateV4(address);
  if (family === 6) {
    const a = address.toLowerCase();
    if (a === '::' || a === '::1') return true;
    const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateV4(mapped[1]);
    const mappedHex = a.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mappedHex) {
      const hi = parseInt(mappedHex[1], 16);
      const lo = parseInt(mappedHex[2], 16);
      return isPrivateV4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    if (/^f[cd]/.test(a)) return true; // unique local fc00::/7
    if (/^fe[89ab]/.test(a)) return true; // link-local fe80::/10
    return false;
  }
  return true; // not an IP at all: refuse
}

/**
 * The importer fetches whatever URL it is given, so it must not be usable to
 * poke at the machine it runs on or its local network. Every hop (including
 * redirects) is checked. This is a sensible guard for a personal app, not a
 * complete defence against DNS rebinding.
 */
async function assertPublicUrl(url: URL): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UrlError('Only http and https links can be imported.');
  }
  if (url.username || url.password) throw new UrlError('Links with a username or password are not supported.');

  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = net.isIP(host)
    ? [host]
    : await dns
        .lookup(host, { all: true })
        .then((r) => r.map((x) => x.address))
        .catch(() => {
          throw new FetchError("Couldn't find that website.");
        });

  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new UrlError('That address is not a public website.');
  }
}

async function readLimited(res: Response): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new FetchError('That page is too large to import.');
    }
    chunks.push(value);
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
}

export interface FetchedPage {
  html: string;
  finalUrl: string;
}

export async function fetchPage(rawUrl: string): Promise<FetchedPage> {
  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    throw new UrlError("That doesn't look like a valid link.");
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicUrl(current);

    let res: Response;
    try {
      res = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; recipig/0.1; personal recipe importer)',
          accept: 'text/html,application/xhtml+xml',
        },
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') throw new FetchError('That site took too long to respond.');
      throw new FetchError("Couldn't reach that site.");
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) throw new FetchError('That site sent a broken redirect.');
      await res.body?.cancel();
      current = new URL(location, current);
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new FetchError(`That site responded with an error (${res.status}).`);
    }

    const type = res.headers.get('content-type') ?? '';
    if (type && !/html|xml/i.test(type)) {
      await res.body?.cancel();
      throw new FetchError("That link doesn't point to a web page.");
    }
    return { html: await readLimited(res), finalUrl: current.toString() };
  }
  throw new FetchError('That link redirected too many times.');
}
