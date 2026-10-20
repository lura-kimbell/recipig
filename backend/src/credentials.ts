import { ValidationError } from './validate.ts';

export interface Credentials {
  username: string;
  password: string;
}

const USERNAME = /^[A-Za-z0-9._-]{3,30}$/;
const MAX_PASSWORD = 500;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readFields(body: unknown): { username: string; password: string } {
  if (!isObject(body) || typeof body.username !== 'string' || typeof body.password !== 'string') {
    throw new ValidationError('Please enter a username and password.');
  }
  return { username: body.username.trim(), password: body.password };
}

/** Passwords can be anything (spaces and all, left exactly as typed) as long as they aren't empty. */
function checkPassword(password: string): void {
  if (password.length === 0) throw new ValidationError('Please enter a password.');
  if (password.length > MAX_PASSWORD) throw new ValidationError(`Passwords can be up to ${MAX_PASSWORD} characters.`);
}

export function parseRegistration(body: unknown): Credentials {
  const { username, password } = readFields(body);
  if (!USERNAME.test(username)) {
    throw new ValidationError('Usernames are 3 to 30 characters: letters, numbers, dots, dashes and underscores.');
  }
  checkPassword(password);
  return { username, password };
}

/** Logging in doesn't re-check the username's format; it just has to match an account. */
export function parseLogin(body: unknown): Credentials {
  const { username, password } = readFields(body);
  if (!username) throw new ValidationError('Please enter your username.');
  checkPassword(password);
  return { username, password };
}
