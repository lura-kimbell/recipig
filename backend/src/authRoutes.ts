import { createHash, timingSafeEqual } from 'node:crypto';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { parseLogin, parseRegistration } from './credentials.ts';
import { hashPassword, spendPasswordCheckTime, verifyPassword } from './password.ts';
import { AttemptLimiter } from './rateLimit.ts';
import {
  clearedSessionCookie,
  newSessionToken,
  hashToken,
  parseCookies,
  SESSION_COOKIE,
  SESSION_DAYS,
  sessionCookie,
} from './session.ts';
import { toPublicUser } from './stores.ts';
import type { PublicUser, Stores } from './stores.ts';
import { ValidationError } from './validate.ts';

export class AuthError extends Error {}
export class RateLimitError extends Error {
  constructor() {
    super('Too many attempts. Please wait a while and try again.');
  }
}

export interface AuthOptions {
  /** Add the Secure flag to the session cookie. Turn on whenever the site is served over https. */
  secureCookie?: boolean;
  /** When set, creating an account needs this invite code, so strangers who find the site can't sign up. */
  signupCode?: string;
  now?: () => number;
}

const LOGIN_MAX = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const REGISTER_MAX = 20;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;

const digest = (s: string) => createHash('sha256').update(s).digest();

/** Compares in constant time, so the code can't be guessed a character at a time from response times. */
function codeMatches(given: unknown, expected: string): boolean {
  return typeof given === 'string' && timingSafeEqual(digest(given.trim()), digest(expected));
}

/** The signed-in user for this request, set by `loadUser`. */
export const currentUser = (res: Response): PublicUser => res.locals.user as PublicUser;

export function createAuth(stores: Stores, options: AuthOptions = {}) {
  const secure = options.secureCookie ?? false;
  const signupCode = options.signupCode?.trim() || undefined;
  const now = options.now ?? Date.now;
  const loginLimiter = new AttemptLimiter(LOGIN_MAX, LOGIN_WINDOW_MS, now);
  const registerLimiter = new AttemptLimiter(REGISTER_MAX, REGISTER_WINDOW_MS, now);

  async function startSession(res: Response, userId: string): Promise<void> {
    const { token, hash } = newSessionToken();
    const expiresAt = new Date(now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await stores.sessions.create(hash, userId, expiresAt);
    res.setHeader('Set-Cookie', sessionCookie(token, secure));
  }

  /** Looks up the session cookie; leaves `res.locals.user` unset when there isn't a valid one. */
  async function loadUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) {
      const hash = hashToken(token);
      const session = await stores.sessions.find(hash);
      if (session && session.expiresAt.getTime() > now()) {
        const user = await stores.users.findById(session.userId);
        if (user) res.locals.user = toPublicUser(user);
      } else if (session) {
        await stores.sessions.delete(hash);
      }
    }
    next();
  }

  function requireUser(_req: Request, res: Response, next: NextFunction): void {
    if (!res.locals.user) throw new AuthError('Please log in.');
    next();
  }

  const router = express.Router();

  router.post('/register', async (req, res) => {
    const ip = req.ip ?? 'unknown';
    if (registerLimiter.isBlocked(ip)) throw new RateLimitError();
    const { username, password } = parseRegistration(req.body);
    // Recorded before the invite code is checked, so wrong guesses count towards the limit.
    registerLimiter.record(ip);
    if (signupCode && !codeMatches(req.body?.inviteCode, signupCode)) {
      throw new ValidationError("That invite code isn't right.");
    }
    const user = await stores.users.create(username, await hashPassword(password));
    await startSession(res, user.id);
    res.status(201).json(toPublicUser(user));
  });

  router.post('/login', async (req, res) => {
    const { username, password } = parseLogin(req.body);
    const key = `${req.ip ?? 'unknown'}|${username.toLowerCase()}`;
    if (loginLimiter.isBlocked(key)) throw new RateLimitError();

    const user = await stores.users.findByUsername(username);
    let ok = false;
    if (user) ok = await verifyPassword(password, user.passwordHash);
    else await spendPasswordCheckTime(password);

    if (!user || !ok) {
      loginLimiter.record(key);
      throw new AuthError('Incorrect username or password.');
    }
    loginLimiter.reset(key);
    await startSession(res, user.id);
    res.json(toPublicUser(user));
  });

  router.post('/logout', async (req, res) => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) await stores.sessions.delete(hashToken(token));
    res.setHeader('Set-Cookie', clearedSessionCookie(secure));
    res.status(204).end();
  });

  /** Tells the sign-up form whether to ask for an invite code. */
  router.get('/signup', (_req, res) => {
    res.json({ inviteCodeRequired: signupCode !== undefined });
  });

  router.get('/me', (_req, res) => {
    if (!res.locals.user) throw new AuthError('Not logged in.');
    res.json(res.locals.user);
  });

  return { router, loadUser, requireUser };
}
