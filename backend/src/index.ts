import path from 'node:path';
import { createApp } from './app.ts';
import { connectMongo } from './mongoStores.ts';

const port = Number(process.env.PORT ?? 3000);
// Localhost only by default: this app fetches arbitrary URLs for logged-in users.
const host = process.env.HOST ?? '127.0.0.1';
const staticDir = process.env.STATIC_DIR ?? path.resolve(import.meta.dirname, '../../frontend/dist/frontend/browser');
const mongoUri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017';
const mongoDb = process.env.MONGODB_DB ?? 'recipig';
const secureCookie = process.env.COOKIE_SECURE === 'true';
const trustProxy = process.env.TRUST_PROXY;
const signupCode = process.env.SIGNUP_CODE;

/** Hide any user:password@ part of the connection string before it is printed. */
const redact = (text: string) => text.replace(/\/\/[^/@\s]*@/g, '//***@');

let mongo;
try {
  mongo = await connectMongo(mongoUri, mongoDb);
} catch (err) {
  console.error(`Could not connect to MongoDB at ${redact(mongoUri)}.`);
  console.error(redact(err instanceof Error ? err.message : String(err)));
  console.error('Start MongoDB, or set MONGODB_URI. See the README for a one-line Docker command.');
  process.exit(1);
}

const app = createApp(mongo.stores, {
  staticDir,
  secureCookie,
  signupCode,
  trustProxy: trustProxy === undefined ? undefined : /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy === 'true' ? true : trustProxy,
});

app.listen(port, host, () => {
  console.log(`Recipig API listening on http://${host}:${port} (database "${mongoDb}")`);
});
