import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * Passwords are stored as salted scrypt hashes ("scrypt$N$r$p$salt$hash"), never as
 * the password itself. scrypt is built into Node, so there is nothing to install.
 */

const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { N: n, r, p, maxmem: MAX_MEMORY }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

/** False for a wrong password and for a stored value that isn't in the expected format. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [n, r, p] = parts.slice(1, 4).map(Number);
  if (![n, r, p].every((v) => Number.isInteger(v) && v > 0) || n > 2 ** 17 || r > 16 || p > 4) return false;
  const expected = Buffer.from(parts[5], 'base64');
  if (expected.length !== KEY_LENGTH) return false;
  try {
    const actual = await derive(password, Buffer.from(parts[4], 'base64'), n, r, p);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Do the same work as a real check against a throwaway hash. Used when the
 * username doesn't exist, so response time doesn't reveal which usernames do.
 */
export async function spendPasswordCheckTime(password: string): Promise<void> {
  dummyHash ??= hashPassword('recipig-placeholder');
  await verifyPassword(password, await dummyHash);
}
