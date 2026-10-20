// Copies recipes from the old backend/data/recipes.json into MongoDB under one user.
// Usage: npm run import-json -- <username> [path/to/recipes.json]
// The user must already exist (create the account in the app first).
import fs from 'node:fs/promises';
import path from 'node:path';
import { connectMongo } from '../src/mongoStores.ts';
import type { Recipe } from '../src/types.ts';

const [username, fileArg] = process.argv.slice(2);
if (!username) {
  console.error('Usage: npm run import-json -- <username> [path/to/recipes.json]');
  process.exit(1);
}
const file = path.resolve(fileArg ?? path.join(import.meta.dirname, '../data/recipes.json'));

const recipes = JSON.parse(await fs.readFile(file, 'utf8')) as Recipe[];
const mongo = await connectMongo(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017', process.env.MONGODB_DB ?? 'recipig');
try {
  const user = await mongo.stores.users.findByUsername(username);
  if (!user) {
    console.error(`No account named "${username}". Create it in the app first, then run this again.`);
    process.exit(1);
  }
  let added = 0;
  for (const recipe of recipes) if (await mongo.stores.recipes.restore(user.id, recipe)) added++;
  console.log(`Imported ${added} of ${recipes.length} recipes for ${user.username} (${recipes.length - added} already existed).`);
} finally {
  await mongo.close();
}
