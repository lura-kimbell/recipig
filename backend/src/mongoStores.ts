import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import type { Collection, Db } from 'mongodb';
import type { Recipe, RecipeDraft } from './types.ts';
import { UsernameTakenError } from './stores.ts';
import type { RecipeStore, SessionRecord, SessionStore, Stores, User, UserStore } from './stores.ts';

/**
 * MongoDB storage. Documents use our own UUID strings as `_id`, so ids look the
 * same as they did in the JSON file and in the URLs.
 *
 *   users:    { _id, username, usernameLower (unique), passwordHash, createdAt }
 *   sessions: { _id: tokenHash, userId, expiresAt (TTL index) }
 *   recipes:  { _id, userId, ...recipe fields }
 */

interface UserDoc {
  _id: string;
  username: string;
  usernameLower: string;
  passwordHash: string;
  createdAt: string;
}

interface SessionDoc {
  _id: string;
  userId: string;
  expiresAt: Date;
}

type RecipeDoc = Omit<Recipe, 'id'> & { _id: string; userId: string };

const OPTIONAL_FIELDS = ['sourceUrl', 'image', 'servings', 'prepTime', 'cookTime', 'totalTime'] as const;
const DUPLICATE_KEY = 11000;

const isDuplicateKey = (err: unknown) => (err as { code?: unknown })?.code === DUPLICATE_KEY;

/** Drop keys whose value is undefined, so optional fields are left out rather than stored as null. */
function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toRecipe(doc: RecipeDoc): Recipe {
  const { _id, userId: _userId, ...rest } = doc;
  return { id: _id, ...rest };
}

class MongoUserStore implements UserStore {
  private readonly col: Collection<UserDoc>;

  constructor(col: Collection<UserDoc>) {
    this.col = col;
  }

  private static toUser(doc: UserDoc): User {
    return { id: doc._id, username: doc.username, passwordHash: doc.passwordHash, createdAt: doc.createdAt };
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
    const set: Record<string, unknown> = {
      title: clean.title,
      ingredients: clean.ingredients,
      steps: clean.steps,
      updatedAt: new Date().toISOString(),
    };
    const unset: Record<string, ''> = {};
    for (const field of OPTIONAL_FIELDS) {
      if (clean[field] === undefined) unset[field] = '';
      else set[field] = clean[field];
    }
    const result = await this.col.findOneAndUpdate(
      { _id: id, userId },
      Object.keys(unset).length > 0 ? { $set: set, $unset: unset } : { $set: set },
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
    await Promise.all([
      users.createIndex({ usernameLower: 1 }, { unique: true }),
      // Mongo deletes sessions shortly after expiresAt passes; the app also checks the date itself.
      sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      recipes.createIndex({ userId: 1, createdAt: -1 }),
    ]);
    return {
      stores: { users: new MongoUserStore(users), sessions: new MongoSessionStore(sessions), recipes: new MongoRecipeStore(recipes) },
      db,
      close: () => client.close(),
    };
  } catch (err) {
    await client.close().catch(() => undefined);
    throw err;
  }
}
