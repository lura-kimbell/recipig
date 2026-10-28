import { randomUUID } from 'node:crypto';
import type { Recipe, RecipeDraft } from './types.ts';
import { foldStepNotes, UsernameTakenError } from './stores.ts';
import type { RecipeStore, SessionRecord, SessionStore, Stores, Theme, User, UserStore } from './stores.ts';

/** In-memory stand-ins for the Mongo stores. Used by the tests; nothing is saved to disk. */

class MemoryUserStore implements UserStore {
  private readonly users: User[] = [];

  async create(username: string, passwordHash: string): Promise<User> {
    const lower = username.toLowerCase();
    if (this.users.some((u) => u.username.toLowerCase() === lower)) throw new UsernameTakenError();
    const user: User = { id: randomUUID(), username, passwordHash, createdAt: new Date().toISOString() };
    this.users.push(user);
    return { ...user };
  }

  async findByUsername(username: string): Promise<User | undefined> {
    const lower = username.toLowerCase();
    const found = this.users.find((u) => u.username.toLowerCase() === lower);
    return found && { ...found };
  }

  async findById(id: string): Promise<User | undefined> {
    const found = this.users.find((u) => u.id === id);
    return found && { ...found };
  }

  async setTheme(id: string, theme: Theme): Promise<boolean> {
    const found = this.users.find((u) => u.id === id);
    if (found) found.theme = theme;
    return found !== undefined;
  }

  async setHideImagesIn(id: string, themes: Theme[]): Promise<boolean> {
    const found = this.users.find((u) => u.id === id);
    if (found) found.hideImagesIn = [...themes];
    return found !== undefined;
  }
}

class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();

  async create(tokenHash: string, userId: string, expiresAt: Date): Promise<void> {
    this.sessions.set(tokenHash, { userId, expiresAt });
  }

  async find(tokenHash: string): Promise<SessionRecord | undefined> {
    const found = this.sessions.get(tokenHash);
    return found && { ...found };
  }

  async delete(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
  }
}

class MemoryRecipeStore implements RecipeStore {
  private readonly rows: { userId: string; recipe: Recipe }[] = [];

  async list(userId: string): Promise<Recipe[]> {
    return this.rows
      .filter((r) => r.userId === userId)
      .map((r) => foldStepNotes(structuredClone(r.recipe)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async get(userId: string, id: string): Promise<Recipe | undefined> {
    const row = this.rows.find((r) => r.userId === userId && r.recipe.id === id);
    return row && foldStepNotes(structuredClone(row.recipe));
  }

  async create(userId: string, draft: RecipeDraft): Promise<Recipe> {
    const now = new Date().toISOString();
    const recipe: Recipe = { ...structuredClone(draft), id: randomUUID(), createdAt: now, updatedAt: now };
    this.rows.push({ userId, recipe });
    return structuredClone(recipe);
  }

  async update(userId: string, id: string, draft: RecipeDraft): Promise<Recipe | undefined> {
    const row = this.rows.find((r) => r.userId === userId && r.recipe.id === id);
    if (!row) return undefined;
    row.recipe = { ...structuredClone(draft), id, createdAt: row.recipe.createdAt, updatedAt: new Date().toISOString() };
    return structuredClone(row.recipe);
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const index = this.rows.findIndex((r) => r.userId === userId && r.recipe.id === id);
    if (index === -1) return false;
    this.rows.splice(index, 1);
    return true;
  }

  async restore(userId: string, recipe: Recipe): Promise<boolean> {
    if (this.rows.some((r) => r.recipe.id === recipe.id)) return false;
    this.rows.push({ userId, recipe: structuredClone(recipe) });
    return true;
  }
}

export function createMemoryStores(): Stores {
  return { users: new MemoryUserStore(), sessions: new MemorySessionStore(), recipes: new MemoryRecipeStore() };
}
