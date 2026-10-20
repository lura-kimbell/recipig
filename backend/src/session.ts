import { createHash, randomBytes } from 'node:crypto';

export const SESSION_COOKIE = 'recipig_session';
export const SESSION_DAYS = 30;

/** The cookie holds a random token; the database holds only its hash. */
export function newSessionToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (!name || name in cookies) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      cookies[name] = decodeURIComponent(raw);
    } catch {
      cookies[name] = raw;
    }
  }
  return cookies;
}

/**
 * HttpOnly keeps scripts from reading the cookie; SameSite=Lax stops other
 * sites from making the browser send it with a POST, PUT or DELETE.
 * Secure should be on whenever the site is served over https.
 */
export function sessionCookie(token: string, secure: boolean): string {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

export function clearedSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}
