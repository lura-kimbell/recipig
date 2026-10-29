import { randomUUID } from 'node:crypto';
import type { Recipe, RecipeDraft } from './types.ts';
import type { StoredImage } from './images.ts';
import type { Source, SourceInput } from './sources.ts';
import { fromStorage, SourceNameTakenError, UsernameTakenError } from './stores.ts';
import type { ImageStore, RecipeStore, SessionRecord, SessionStore, SourceStore, Stores, Theme, User, UserStore } from './stores.ts';

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
      .map((r) => fromStorage(structuredClone(r.recipe)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async get(userId: string, id: string): Promise<Recipe | undefined> {
    const row = this.rows.find((r) => r.userId === userId && r.recipe.id === id);
    return row && fromStorage(structuredClone(row.recipe));
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

  async clearSource(userId: string, sourceId: string): Promise<void> {
    for (const row of this.rows) if (row.userId === userId && row.recipe.sourceId === sourceId) delete row.recipe.sourceId;
  }
}

class MemorySourceStore implements SourceStore {
  private readonly rows: { userId: string; source: Source }[] = [];

  private nameTaken(userId: string, name: string, exceptId?: string): boolean {
    const lower = name.toLowerCase();
    return this.rows.some((r) => r.userId === userId && r.source.id !== exceptId && r.source.name.toLowerCase() === lower);
  }

  async list(userId: string): Promise<Source[]> {
    return this.rows
      .filter((r) => r.userId === userId)
      .map((r) => ({ ...r.source }))
      .sort((a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1));
  }

  async get(userId: string, id: string): Promise<Source | undefined> {
    const row = this.rows.find((r) => r.userId === userId && r.source.id === id);
    return row && { ...row.source };
  }

  async create(userId: string, input: SourceInput): Promise<Source> {
    if (this.nameTaken(userId, input.name)) throw new SourceNameTakenError();
    const source = { id: randomUUID(), name: input.name, icon: input.icon };
    this.rows.push({ userId, source });
    return { ...source };
  }

  async update(userId: string, id: string, input: SourceInput): Promise<Source | undefined> {
    const row = this.rows.find((r) => r.userId === userId && r.source.id === id);
    if (!row) return undefined;
    if (this.nameTaken(userId, input.name, id)) throw new SourceNameTakenError();
    row.source = { id, name: input.name, icon: input.icon };
    return { ...row.source };
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const index = this.rows.findIndex((r) => r.userId === userId && r.source.id === id);
    if (index === -1) return false;
    this.rows.splice(index, 1);
    return true;
  }
}

class MemoryImageStore implements ImageStore {
  private readonly rows: { id: string; userId: string; image: StoredImage; createdAt: Date }[] = [];

  async create(userId: string, image: StoredImage): Promise<string> {
    const id = randomUUID();
    this.rows.push({ id, userId, image: { contentType: image.contentType, data: Buffer.from(image.data) }, createdAt: new Date() });
    return id;
  }

  async get(userId: string, id: string): Promise<StoredImage | undefined> {
    const row = this.rows.find((r) => r.userId === userId && r.id === id);
    return row && { contentType: row.image.contentType, data: Buffer.from(row.image.data) };
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const index = this.rows.findIndex((r) => r.userId === userId && r.id === id);
    if (index === -1) return false;
    this.rows.splice(index, 1);
    return true;
  }

  async sweep(userId: string, keep: ReadonlySet<string>, before: Date): Promise<number> {
    const doomed = this.rows.filter((r) => r.userId === userId && !keep.has(r.id) && r.createdAt < before);
    for (const row of doomed) this.rows.splice(this.rows.indexOf(row), 1);
    return doomed.length;
  }
}

export function createMemoryStores(): Stores {
  return {
    users: new MemoryUserStore(),
    sessions: new MemorySessionStore(),
    recipes: new MemoryRecipeStore(),
    sources: new MemorySourceStore(),
    images: new MemoryImageStore(),
  };
}
