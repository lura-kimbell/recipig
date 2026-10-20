/**
 * Where to go after logging in. Only same-site paths are allowed, so a crafted
 * link like /login?returnUrl=https://evil.example can't send someone elsewhere.
 * (No imports and no TypeScript-only syntax, so the test runs under plain `node --test`.)
 */
export function safeReturnUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/')) return '/';
  // "//host" and "/\host" are read by browsers as other sites; control characters have no business here.
  if (value.startsWith('//') || value.startsWith('/\\') || /[\u0000-\u001f\u007f]/.test(value)) return '/';
  // Bouncing back to a login page would be pointless.
  if (/^\/(login|register)(?:[/?#]|$)/.test(value)) return '/';
  return value;
}
