import path from 'node:path';
import { createApp } from './app.ts';
import { RecipeStore } from './store.ts';

const port = Number(process.env.PORT ?? 3000);
// Localhost only by default: this app fetches arbitrary URLs and has no login.
const host = process.env.HOST ?? '127.0.0.1';
const dataDir = process.env.DATA_DIR ?? path.resolve(import.meta.dirname, '../data');
const staticDir = process.env.STATIC_DIR ?? path.resolve(import.meta.dirname, '../../frontend/dist/frontend/browser');

const app = createApp(new RecipeStore(path.join(dataDir, 'recipes.json')), { staticDir });

app.listen(port, host, () => {
  console.log(`Recipig API listening on http://${host}:${port}`);
});
