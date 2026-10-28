import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import * as z from 'zod/v4';
import { buildDraft, dropSingleSection, NoRecipeError } from './extract.ts';
import type { RawItem } from './extract.ts';
import type { RecipeDraft } from './types.ts';

/** One photo of a cookbook page, as sent by the browser (already resized there). */
export interface RecipePhoto {
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  /** Base64, without a data: prefix. */
  data: string;
}

/** What reading the photos found; a missing recipe is `found: false`. */
export type PhotoReading = z.infer<typeof READING>;

/** Reads a recipe out of photos. Swappable so tests don't call Claude. */
export type PhotoReader = (photos: RecipePhoto[]) => Promise<PhotoReading>;

/** Reading photos isn't set up (no API key), or Claude couldn't be reached. Shown to the user as is. */
export class PhotoReadError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const ITEM = z.object({
  text: z.string(),
  section: z.string().nullable(),
});

const READING = z.object({
  found: z.boolean(),
  title: z.string(),
  servings: z.string().nullable(),
  prepTime: z.string().nullable(),
  cookTime: z.string().nullable(),
  totalTime: z.string().nullable(),
  ingredients: z.array(ITEM),
  steps: z.array(ITEM),
});

const MODEL = 'claude-opus-5-5';

const NO_RECIPE_IN_PHOTOS = "Couldn't find a recipe in those photos. Make sure the ingredients and method are in view.";

const INSTRUCTIONS = `These photos show one recipe from a cookbook, in page order. It may run from one page onto the next.

Transcribe the recipe:
- title: the recipe's name as printed.
- servings, prepTime, cookTime, totalTime: as printed (for example "Serves 4", "20 min", "1 hr 15 min"), or null when the book doesn't say.
- ingredients: one entry per ingredient line, worded exactly as printed, keeping amounts and fractions (use ½, ¼, ¾ etc. or 1/2 as printed). If the list is split under sub-headings ("For the sauce", "Topping"), put that heading in section for each line under it; otherwise section is null. Don't include the sub-headings as ingredients.
- steps: one entry per method step or paragraph, worded exactly as printed; don't summarise or reword. Drop step numbers. Use section the same way when the method has sub-headings.

Leave out everything that isn't the recipe itself: the introduction or story above it, page numbers, running headers, photo captions, and any other recipe that shares a page. If text is cut off at a page edge, transcribe what is legible and carry on from the next photo.

If the photos don't show a recipe (or not enough to read one), set found to false and leave the lists empty.`;

/** A reader that asks Claude. Returns undefined when no API key is configured. */
export function claudePhotoReader(apiKey = process.env.ANTHROPIC_API_KEY): PhotoReader | undefined {
  if (!apiKey) return undefined;
  const client = new Anthropic({ apiKey });

  return async (photos) => {
    let message;
    try {
      message = await client.beta.messages.parse({
        model: MODEL,
        max_tokens: 16000,
        // If this model declines, the API retries on a fallback model instead of failing.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: betaZodOutputFormat(READING) },
        messages: [
          {
            role: 'user',
            content: [
              ...photos.map((p) => ({
                type: 'image' as const,
                source: { type: 'base64' as const, media_type: p.mediaType, data: p.data },
              })),
              { type: 'text' as const, text: INSTRUCTIONS },
            ],
          },
        ],
      });
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) {
        throw new PhotoReadError('Too many photo imports at once. Please try again in a minute.', 503);
      }
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
        console.error('Photo import: the Anthropic API key was rejected.', e.message);
        throw new PhotoReadError("Reading photos isn't working right now (the server's API key was rejected).", 503);
      }
      if (e instanceof Anthropic.BadRequestError) {
        console.error('Photo import: request rejected.', e.message);
        throw new PhotoReadError("Couldn't read those photos. Try fewer or smaller photos.", 400);
      }
      if (e instanceof Anthropic.APIError) {
        console.error('Photo import failed.', e.status, e.message);
        throw new PhotoReadError("Couldn't reach the photo reader. Please try again.", 502);
      }
      throw e;
    }

    if (message.stop_reason === 'refusal') throw new NoRecipeError(NO_RECIPE_IN_PHOTOS);
    if (message.stop_reason === 'max_tokens' || !message.parsed_output) {
      throw new PhotoReadError("That recipe was too long to read in one go. Try fewer photos.", 422);
    }
    return message.parsed_output;
  };
}

const clean = (s: string | null | undefined): string | undefined => s?.replace(/\s+/g, ' ').trim() || undefined;

function items(list: { text: string; section: string | null }[]): RawItem[] {
  return list.flatMap((i) => {
    const text = clean(i.text);
    if (!text) return [];
    const section = clean(i.section);
    return [{ text, ...(section ? { section } : {}) }];
  });
}

/** Turn what was read from the photos into an (unsaved) recipe draft, like a URL import. */
export function draftFromReading(reading: PhotoReading): RecipeDraft {
  const ingredients = dropSingleSection(items(reading.ingredients));
  const steps = dropSingleSection(items(reading.steps));
  if (!reading.found || ingredients.length === 0 || steps.length === 0) {
    throw new NoRecipeError(NO_RECIPE_IN_PHOTOS);
  }
  return buildDraft({
    title: clean(reading.title) ?? 'Untitled recipe',
    servings: clean(reading.servings),
    prepTime: clean(reading.prepTime),
    cookTime: clean(reading.cookTime),
    totalTime: clean(reading.totalTime),
    ingredients,
    steps,
  });
}
