import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Recipe, RecipeDraft } from './types.ts';

/**
 * A tiny JSON-file recipe store. Fine for a personal cookbook; swap for a real
 * database if this ever needs multiple users or heavy traffic.
 * All operations are serialised so concurrent requests can't clobber the file.
 */
export class RecipeStore {
  private readonly file: string;
  private cache: Recipe[] | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(file: string) {
    this.file = file;
  }

  private run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async load(): Promise<Recipe[]> {
    if (this.cache) return this.cache;
    try {
      this.cache = JSON.parse(await fs.readFile(this.file, 'utf8')) as Recipe[];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      this.cache = [];
    }
    return this.cache;
  }

  private async persist(recipes: Recipe[]): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(recipes, null, 2));
    await fs.rename(tmp, this.file);
    this.cache = recipes;
  }

  /** Newest first. */
  list(): Promise<Recipe[]> {
    return this.run(async () => [...(await this.load())].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }

  get(id: string): Promise<Recipe | undefined> {
    return this.run(async () => (await this.load()).find((r) => r.id === id));
  }

  create(draft: RecipeDraft): Promise<Recipe> {
    return this.run(async () => {
      const recipes = await this.load();
      const now = new Date().toISOString();
      const recipe: Recipe = { ...draft, id: randomUUID(), createdAt: now, updatedAt: now };
      await this.persist([...recipes, recipe]);
      return recipe;
    });
  }

  update(id: string, draft: RecipeDraft): Promise<Recipe | undefined> {
    return this.run(async () => {
      const recipes = await this.load();
      const existing = recipes.find((r) => r.id === id);
      if (!existing) return undefined;
      const updated: Recipe = { ...draft, id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() };
      await this.persist(recipes.map((r) => (r.id === id ? updated : r)));
      return updated;
    });
  }

  remove(id: string): Promise<boolean> {
    return this.run(async () => {
      const recipes = await this.load();
      if (!recipes.some((r) => r.id === id)) return false;
      await this.persist(recipes.filter((r) => r.id !== id));
      return true;
    });
  }
}
