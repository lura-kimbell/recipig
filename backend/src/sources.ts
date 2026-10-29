import { ValidationError } from './validate.ts';

/**
 * Icons a source can have: MingCute line icons in frontend/public/source-icons, by file
 * name. Must match SOURCE_ICONS in frontend/src/app/models.ts.
 */
export const SOURCE_ICONS = [
  'book',
  'notebook',
  'news',
  'globe',
  'chef-hat',
  'tv',
  'video',
  'youtube',
  'instagram',
  'tiktok',
  'pinterest',
  'mail',
  'home',
  'group',
  'user-heart',
  'pen',
  'heart',
  'star',
  'bookmark',
  'fork-knife',
  'store',
  'pot',
  'cake',
  'leaf',
] as const;

export type SourceIcon = (typeof SOURCE_ICONS)[number];

/**
 * Where a cook's recipes come from (a cookbook, a newspaper, a channel), defined once per
 * account and given to any number of recipes. A recipe's sourceUrl is separate: the page it
 * was imported from.
 */
export interface Source {
  id: string;
  name: string;
  icon: SourceIcon;
}

export type SourceInput = Omit<Source, 'id'>;

const MAX_NAME = 60;

export function parseSourceInput(body: unknown): SourceInput {
  const raw = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const name = typeof raw.name === 'string' ? raw.name.replace(/\s+/g, ' ').trim() : '';
  if (!name) throw new ValidationError('Please give the source a name.');
  if (name.length > MAX_NAME) throw new ValidationError(`Source names can be up to ${MAX_NAME} characters.`);
  const icon = SOURCE_ICONS.find((i) => i === raw.icon);
  if (!icon) throw new ValidationError('Please pick an icon for the source.');
  return { name, icon };
}
