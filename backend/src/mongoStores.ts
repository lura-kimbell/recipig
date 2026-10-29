import { randomUUID } from 'node:crypto';
import { Binary, MongoClient } from 'mongodb';
import type { Collection, Db } from 'mongodb';
import type { StoredImage, UploadType } from './images.ts';
import type { Recipe, RecipeDraft } from './types.ts';
import type { Source, SourceIcon, SourceInput } from './sources.ts';
import { fromStorage, SourceNameTakenError, UsernameTakenError } from './stores.ts';
import type { ImageStore, RecipeStore, SessionRecord, SessionStore, SourceStore, Stores, Theme, User, UserStore } from './stores.ts';

/**
 * MongoDB storage. Documents use our own UUID strings as `_id`, so ids look the
 * same as they did in the JSON file and in the URLs.
 *
 *   users:    { _id, username, usernameLower (unique), passwordHash, createdAt }
 *   sessions: { _id: tokenHash, userId, expiresAt (TTL index) }
 *   recipes:  { _id, userId, ...recipe fields }
 *   sources:  { _id, userId, name, nameLower (unique per user), icon }
 *   images:   { _id, userId, contentType, data (binary), createdAt }
 */

interface UserDoc {
  _id: string;
  username: string;
  usernameLower: string;
  passwordHash: string;
  createdAt: string;
  theme?: Theme;
  hideImagesIn?: Theme[];
}

interface SessionDoc {
  _id: string;
  userId: string;
  expiresAt: Date;
}

type RecipeDoc = Omit<Recipe, 'id'> & { _id: string; userId: string };

interface SourceDoc {
  _id: string;
  userId: string;
  name: string;
  nameLower: string;
  icon: SourceIcon;
}

const toSource = (doc: SourceDoc): Source => ({ id: doc._id, name: doc.name, icon: doc.icon });

interface ImageDoc {
  _id: string;
  userId: string;
  contentType: UploadType;
  data: Binary;
  createdAt: Date;
}

const OPTIONAL_FIELDS = ['sourceUrl', 'sourceId', 'image', 'servings', 'prepTime', 'cookTime', 'totalTime', 'notes', 'tags'] as const;
const DUPLICATE_KEY = 11000;

const isDuplicateKey = (err: unknown) => (err as { code?: unknown })?.code === DUPLICATE_KEY;

/** Drop keys whose value is undefined, so optional fields are left out rather than stored as null. */
function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toRecipe(doc: RecipeDoc): Recipe {
  const { _id, userId: _userId, ...rest } = doc;
  return fromStorage({ id: _id, ...rest });
}

class MongoUserStore implements UserStore {
  private readonly col: Collection<UserDoc>;

  constructor(col: Collection<UserDoc>) {
    this.col = col;
  }

  private static toUser(doc: UserDoc): User {
    return {
      id: doc._id,
      username: doc.username,
      passwordHash: doc.passwordHash,
      createdAt: doc.createdAt,
      ...(doc.theme ? { theme: doc.theme } : {}),
      ...(doc.hideImagesIn ? { hideImagesIn: doc.hideImagesIn } : {}),
    };
  }

  async create(username: string, passwordHash: string): Promise<User> {
    const doc: UserDoc = {
      _id: randomUUID(),
      username,
      usernameLower: username.toLowerCase(),
      passwordHash,
      createdAt: new Date().toISOString(),
    };
    try {
      await this.col.insertOne(doc);
    } catch (err) {
      if (isDuplicateKey(err)) throw new UsernameTakenError();
      throw err;
    }
    return MongoUserStore.toUser(doc);
  }

  async findByUsername(username: string): Promise<User | undefined> {
    const doc = await this.col.findOne({ usernameLower: username.toLowerCase() });
    return doc ? MongoUserStore.toUser(doc) : undefined;
  }

  async findById(id: string): Promise<User | undefined> {
    const doc = await this.col.findOne({ _id: id });
    return doc ? MongoUserStore.toUser(doc) : undefined;
  }

  async setTheme(id: string, theme: Theme): Promise<boolean> {
    const result = await this.col.updateOne({ _id: id }, { $set: { theme } });
    return result.matchedCount === 1;
  }

  async setHideImagesIn(id: string, themes: Theme[]): Promise<boolean> {
    const result = await this.col.updateOne({ _id: id }, { $set: { hideImagesIn: themes } });
    return result.matchedCount === 1;
  }
}

class MongoSessionStore implements SessionStore {
  private readonly col: Collection<SessionDoc>;

  constructor(col: Collection<SessionDoc>) {
    this.col = col;
  }

  async create(tokenHash: string, userId: string, expiresAt: Date): Promise<void> {
    await this.col.insertOne({ _id: tokenHash, userId, expiresAt });
  }

  async find(tokenHash: string): Promise<SessionRecord | undefined> {
    const doc = await this.col.findOne({ _id: tokenHash });
    return doc ? { userId: doc.userId, expiresAt: doc.expiresAt } : undefined;
  }

  async delete(tokenHash: string): Promise<void> {
    await this.col.deleteOne({ _id: tokenHash });
  }
}

class MongoRecipeStore implements RecipeStore {
  private readonly col: Collection<RecipeDoc>;

  constructor(col: Collection<RecipeDoc>) {
    this.col = col;
  }

  async list(userId: string): Promise<Recipe[]> {
    const docs = await this.col.find({ userId }).sort({ createdAt: -1 }).toArray();
    return docs.map(toRecipe);
  }

  async get(userId: string, id: string): Promise<Recipe | undefined> {
    const doc = await this.col.findOne({ _id: id, userId });
    return doc ? toRecipe(doc) : undefined;
  }

  async create(userId: string, draft: RecipeDraft): Promise<Recipe> {
    const now = new Date().toISOString();
    const recipe: Recipe = { ...stripUndefined(draft), id: randomUUID(), createdAt: now, updatedAt: now };
    const { id, ...rest } = recipe;
    await this.col.insertOne({ _id: id, userId, ...rest });
    return recipe;
  }

  async update(userId: string, id: string, draft: RecipeDraft): Promise<Recipe | undefined> {
    const clean = stripUndefined(draft);
    // An older recipe may still have free-text source (see foldSourceText), already read into its notes.
    const unset: Record<string, ''> = { source: '' };
    const set: Record<string, unknown> = {
      title: clean.title,
      ingredients: clean.ingredients,
      steps: clean.steps,
      updatedAt: new Date().toISOString(),
    };
    for (const field of OPTIONAL_FIELDS) {
      if (clean[field] === undefined) unset[field] = '';
      else set[field] = clean[field];
    }
    const result = await this.col.findOneAndUpdate(
      { _id: id, userId },
      { $set: set, $unset: unset },
      { returnDocument: 'after' },
    );
    return result ? toRecipe(result) : undefined;
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const result = await this.col.deleteOne({ _id: id, userId });
    return result.deletedCount === 1;
  }

  async restore(userId: string, recipe: Recipe): Promise<boolean> {
    const { id, ...rest } = stripUndefined(recipe);
    try {
      await this.col.insertOne({ _id: id, userId, ...rest });
      return true;
    } catch (err) {
      if (isDuplicateKey(err)) return false;
      throw err;
    }
  }

  async clearSource(userId: string, sourceId: string): Promise<void> {
    await this.col.updateMany({ userId, sourceId }, { $unset: { sourceId: '' } });
  }
}

class MongoSourceStore implements SourceStore {
  private readonly col: Collection<SourceDoc>;

  constructor(col: Collection<SourceDoc>) {
    this.col = col;
  }

  async list(userId: string): Promise<Source[]> {
    const docs = await this.col.find({ userId }).sort({ nameLower: 1 }).toArray();
    return docs.map(toSource);
  }

  async get(userId: string, id: string): Promise<Source | undefined> {
    const doc = await this.col.findOne({ _id: id, userId });
    return doc ? toSource(doc) : undefined;
  }

  async create(userId: string, input: SourceInput): Promise<Source> {
    const doc: SourceDoc = { _id: randomUUID(), userId, name: input.name, nameLower: input.name.toLowerCase(), icon: input.icon };
    try {
      await this.col.insertOne(doc);
    } catch (err) {
      if (isDuplicateKey(err)) throw new SourceNameTakenError();
      throw err;
    }
    return toSource(doc);
  }

  async update(userId: string, id: string, input: SourceInput): Promise<Source | undefined> {
    try {
      const doc = await this.col.findOneAndUpdate(
        { _id: id, userId },
        { $set: { name: input.name, nameLower: input.name.toLowerCase(), icon: input.icon } },
        { returnDocument: 'after' },
      );
      return doc ? toSource(doc) : undefined;
    } catch (err) {
      if (isDuplicateKey(err)) throw new SourceNameTakenError();
      throw err;
    }
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const result = await this.col.deleteOne({ _id: id, userId });
    return result.deletedCount === 1;
  }
}

class MongoImageStore implements ImageStore {
  private readonly col: Collection<ImageDoc>;

  constructor(col: Collection<ImageDoc>) {
    this.col = col;
  }

  async create(userId: string, image: StoredImage): Promise<string> {
    const id = randomUUID();
    await this.col.insertOne({ _id: id, userId, contentType: image.contentType, data: new Binary(image.data), createdAt: new Date() });
    return id;
  }

  async get(userId: string, id: string): Promise<StoredImage | undefined> {
    const doc = await this.col.findOne({ _id: id, userId });
    return doc ? { contentType: doc.contentType, data: Buffer.from(doc.data.buffer) } : undefined;
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const result = await this.col.deleteOne({ _id: id, userId });
    return result.deletedCount === 1;
  }

  async sweep(userId: string, keep: ReadonlySet<string>, before: Date): Promise<number> {
    const result = await this.col.deleteMany({ userId, _id: { $nin: [...keep] }, createdAt: { $lt: before } });
    return result.deletedCount;
  }
}

export interface MongoHandle {
  stores: Stores;
  db: Db;
  close(): Promise<void>;
}

/** Connects, creates the indexes (safe to repeat), and returns the stores. */
export async function connectMongo(uri: string, dbName: string): Promise<MongoHandle> {
  const client = new MongoClient(uri, { ignoreUndefined: true, serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    const db = client.db(dbName);
    const users = db.collection<UserDoc>('users');
    const sessions = db.collection<SessionDoc>('sessions');
    const recipes = db.collection<RecipeDoc>('recipes');
    const sources = db.collection<SourceDoc>('sources');
    const images = db.collection<ImageDoc>('images');
    await Promise.all([
      users.createIndex({ usernameLower: 1 }, { unique: true }),
      // Mongo deletes sessions shortly after expiresAt passes; the app also checks the date itself.
      sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      recipes.createIndex({ userId: 1, createdAt: -1 }),
      sources.createIndex({ userId: 1, nameLower: 1 }, { unique: true }),
      images.createIndex({ userId: 1, createdAt: 1 }),
    ]);
    return {
      stores: {
        users: new MongoUserStore(users),
        sessions: new MongoSessionStore(sessions),
        recipes: new MongoRecipeStore(recipes),
        sources: new MongoSourceStore(sources),
        images: new MongoImageStore(images),
      },
      db,
      close: () => client.close(),
    };
  } catch (err) {
    await client.close().catch(() => undefined);
    throw err;
  }
}
