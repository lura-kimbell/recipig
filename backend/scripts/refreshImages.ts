// Gives saved recipes the sharpest version of their photo, using the same choice as a new
// import (extract.ts: recipePhoto). Each recipe's source page is read again; its photo is
// replaced only when the saved one came from that page (the same photo, or another image the
// page offers for the recipe), so a photo the cook picked themselves is left alone. The new
// image must load before it is saved.
//
// Usage: npm run refresh-images -- [--dry-run]
//   MONGODB_URI  (default mongodb://127.0.0.1:27017)
//   MONGODB_DB   (default recipig)
// --dry-run prints what would change without saving anything. Safe to run more than once.
import { recipePhoto } from '../src/extract.ts';
import { fetchPage } from '../src/fetchPage.ts';
import { connectMongo } from '../src/mongoStores.ts';

const dryRun = process.argv.includes('--dry-run');
const mongo = await connectMongo(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017', process.env.MONGODB_DB ?? 'recipig');

/** Whether a URL answers with an image. */
async function loadsAsImage(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (Recipig photo check)' }, signal: AbortSignal.timeout(15_000) });
    await res.body?.cancel();
    return res.ok && (res.headers.get('content-type') ?? '').startsWith('image/');
  } catch {
    return false;
  }
}

try {
  const recipes = mongo.db.collection<{ _id: string; title: string; image?: string; sourceUrl?: string }>('recipes');
  const all = await recipes.find({}, { projection: { title: 1, image: 1, sourceUrl: 1 } }).toArray();
  let changed = 0;
  for (const r of all) {
    const name = r.title.slice(0, 40).padEnd(41);
    if (!r.image || !r.sourceUrl) {
      console.log(`${name}left as is (${!r.image ? 'no photo' : 'no source link'})`);
      continue;
    }
    let photo: ReturnType<typeof recipePhoto>;
    try {
      const { html, finalUrl } = await fetchPage(r.sourceUrl);
      photo = recipePhoto(html, finalUrl);
    } catch (err) {
      console.log(`${name}left as is (couldn't read the page: ${err instanceof Error ? err.message : err})`);
      continue;
    }
    if (!photo.best || photo.best === r.image) {
      console.log(`${name}left as is (already the best photo)`);
    } else if (!photo.offers(r.image)) {
      console.log(`${name}left as is (you chose this photo yourself)`);
    } else if (!(await loadsAsImage(photo.best))) {
      console.log(`${name}left as is (the larger photo didn't load)`);
    } else {
      if (!dryRun) await recipes.updateOne({ _id: r._id }, { $set: { image: photo.best } });
      changed++;
      console.log(`${name}${dryRun ? 'would update' : 'updated'}: ${photo.best}`);
    }
  }
  console.log(`\n${dryRun ? 'Would update' : 'Updated'} ${changed} of ${all.length} recipes.${dryRun ? ' Nothing was saved (dry run).' : ''}`);
} finally {
  await mongo.close();
}
