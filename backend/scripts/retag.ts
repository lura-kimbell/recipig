// Moves recipes saved before Turkey, Duck and Shellfish were tags (November 2026) onto them:
// a recipe tagged Poultry whose title or ingredients name turkey or duck gets that tag (and
// keeps Poultry only if chicken or another bird is there too); one tagged Fish that names
// shrimp, crab, mussels and so on gets Shellfish (keeping Fish only if there is fish too).
// Other tags are left as the cook set them (tags.ts: splitOldTags).
//
// Usage: npm run retag -- [--dry-run]
//   MONGODB_URI  (default mongodb://127.0.0.1:27017)
//   MONGODB_DB   (default recipig)
// --dry-run prints what would change without saving anything. Safe to run more than once.
import { connectMongo } from '../src/mongoStores.ts';
import { splitOldTags } from '../src/tags.ts';

const dryRun = process.argv.includes('--dry-run');
const mongo = await connectMongo(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017', process.env.MONGODB_DB ?? 'recipig');

try {
  const recipes = mongo.db.collection<{ _id: string; title: string; tags?: string[]; ingredients: { text: string }[] }>('recipes');
  const all = await recipes
    .find({ tags: { $in: ['Poultry', 'Chicken', 'Fish'] } }, { projection: { title: 1, tags: 1, ingredients: 1 } })
    .toArray();
  let changed = 0;
  for (const r of all) {
    const before = r.tags ?? [];
    const after = splitOldTags(before, r.title, r.ingredients.map((i) => i.text));
    if (after.join() === before.join()) continue;
    if (!dryRun) await recipes.updateOne({ _id: r._id }, { $set: { tags: after } });
    changed++;
    console.log(`${r.title.slice(0, 40).padEnd(41)}${before.join(', ')} -> ${after.join(', ')}`);
  }
  console.log(`\n${dryRun ? 'Would retag' : 'Retagged'} ${changed} of ${all.length} Poultry and Fish recipes.${dryRun ? ' Nothing was saved (dry run).' : ''}`);
} finally {
  await mongo.close();
}
