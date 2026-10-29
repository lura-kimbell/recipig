import type { Source, SourceInput } from './sources.ts';
import type { Recipe, RecipeDraft } from './types.ts';

/**
 * What the app needs from storage. The real implementation is MongoDB
 * (mongoStores.ts); memoryStores.ts is a stand-in used by the tests. Both are
 * checked by the same contract tests (test/storeContract.ts).
 */

export interface User {
  id: string;
  /** As the person typed it when they signed up. */
  username: string;
  passwordHash: string;
  createdAt: string;
  /** The look they picked (one of THEMES); absent means the default. */
  theme?: Theme;
  /** Themes in which they've chosen to hide recipe photos; absent means DEFAULT_HIDE_IMAGES_IN. */
  hideImagesIn?: Theme[];
}

/** The app's looks. The first is the default. */
export const THEMES = ['friendly', 'aurora', 'terminal'] as const;
export type Theme = (typeof THEMES)[number];
export const isTheme = (v: unknown): v is Theme => typeof v === 'string' && (THEMES as readonly string[]).includes(v);

/** Until someone changes it, recipe photos are hidden in Terminal, to keep its text-only look. */
export const DEFAULT_HIDE_IMAGES_IN: readonly Theme[] = ['terminal'];

/** The part of a user that is safe to send to the browser. */
export interface PublicUser {
  id: string;
  username: string;
  theme: Theme;
  hideImagesIn: Theme[];
}

export const toPublicUser = (user: User): PublicUser => ({
  id: user.id,
  username: user.username,
  // A theme that has since been removed falls back to the default.
  theme: isTheme(user.theme) ? user.theme : THEMES[0],
  hideImagesIn: (user.hideImagesIn ?? DEFAULT_HIDE_IMAGES_IN).filter(isTheme),
});

/**
 * For a while (October 2026) each step could carry its own notes. Those now belong
 * in the recipe's notes, so a recipe read from storage has any step notes moved
 * there as "Step 2: ...". Saving the recipe makes the move permanent.
 */
export function foldStepNotes(recipe: Recipe): Recipe {
  const moved: string[] = [];
  let found = false;
  const steps = recipe.steps.map((step, i) => {
    const { notes, ...rest } = step as typeof step & { notes?: unknown };
    if (notes === undefined) return step;
    found = true;
    if (typeof notes === 'string' && notes.trim()) moved.push(`Step ${i + 1}: ${notes.trim()}`);
    return rest;
  });
  if (!found) return recipe;
  const notes = [recipe.notes?.trim(), ...moved].filter(Boolean).join('\n\n');
  return { ...recipe, steps, ...(notes ? { notes } : {}) };
}

/**
 * Briefly (October 2026) a recipe's source was free text such as a cookbook name. Sources
 * are now their own records (sources.ts), so any such text is moved into the recipe's notes
 * as "Source: ..." when it is read, for the cook to turn into a source. Saving makes it permanent.
 */
export function foldSourceText(recipe: Recipe): Recipe {
  const { source, ...rest } = recipe as Recipe & { source?: unknown };
  if (source === undefined) return recipe;
  const text = typeof source === 'string' ? source.trim() : '';
  const notes = [rest.notes?.trim(), text && 'Source: ' + text].filter(Boolean).join('\n\n');
  return { ...rest, ...(notes ? { notes } : {}) };
}

/** A recipe as read from storage, with older shapes brought up to date. */
export const fromStorage = (recipe: Recipe): Recipe => foldSourceText(foldStepNotes(recipe));

export interface SessionRecord {
  userId: string;
  expiresAt: Date;
}

export class UsernameTakenError extends Error {
  constructor() {
    super('That username is taken. Please choose another.');
  }
}

export interface UserStore {
  /** Throws UsernameTakenError if the username is already used (upper and lower case count as the same). */
  create(username: string, passwordHash: string): Promise<User>;
  findByUsername(username: string): Promise<User | undefined>;
  findById(id: string): Promise<User | undefined>;
  /** Saves the user's theme; false if there is no such user. */
  setTheme(id: string, theme: Theme): Promise<boolean>;
  /** Saves the themes in which the user hides recipe photos; false if there is no such user. */
  setHideImagesIn(id: string, themes: Theme[]): Promise<boolean>;
}

export interface SessionStore {
  /** `tokenHash` is a hash of the cookie value, so a leaked database can't be used to log in. */
  create(tokenHash: string, userId: string, expiresAt: Date): Promise<void>;
  /** May still return a session just past its expiry (databases clear them lazily), so callers check `expiresAt`. */
  find(tokenHash: string): Promise<SessionRecord | undefined>;
  delete(tokenHash: string): Promise<void>;
}

/** Every method is limited to one user's recipes: someone else's id behaves as if it didn't exist. */
export interface RecipeStore {
  /** Newest first. */
  list(userId: string): Promise<Recipe[]>;
  get(userId: string, id: string): Promise<Recipe | undefined>;
  create(userId: string, draft: RecipeDraft): Promise<Recipe>;
  update(userId: string, id: string, draft: RecipeDraft): Promise<Recipe | undefined>;
  remove(userId: string, id: string): Promise<boolean>;
  /** Insert a recipe exactly as it is (id and dates kept); false if that id already exists. Used by the JSON import script. */
  restore(userId: string, recipe: Recipe): Promise<boolean>;
  /** Take a source off every recipe that has it (when the source is deleted). */
  clearSource(userId: string, sourceId: string): Promise<void>;
}

export class SourceNameTakenError extends Error {
  constructor() {
    super('You already have a source with that name.');
  }
}

/** One user's sources. Names are unique per user, ignoring case. */
export interface SourceStore {
  /** In name order. */
  list(userId: string): Promise<Source[]>;
  get(userId: string, id: string): Promise<Source | undefined>;
  /** Throws SourceNameTakenError for a name already used. */
  create(userId: string, input: SourceInput): Promise<Source>;
  /** Throws SourceNameTakenError for a name another source uses; undefined if there is no such source. */
  update(userId: string, id: string, input: SourceInput): Promise<Source | undefined>;
  remove(userId: string, id: string): Promise<boolean>;
}

export interface Stores {
  users: UserStore;
  sessions: SessionStore;
  recipes: RecipeStore;
  sources: SourceStore;
}
