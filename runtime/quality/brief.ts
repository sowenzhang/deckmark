import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DeckBrief, QualityMode } from './types.ts';
import { contentHash } from '../store/build-hash.ts';

export const BRIEF_FILENAME = 'deckmark.brief.json';

const REQUIRED_FIELDS: Array<{ path: string; value: (brief: DeckBrief) => unknown }> = [
  { path: 'audience.description', value: brief => brief.audience?.description },
  { path: 'purpose', value: brief => brief.purpose },
  { path: 'key_takeaway', value: brief => brief.key_takeaway },
  { path: 'desired_action', value: brief => brief.desired_action },
  { path: 'visual_direction', value: brief => brief.visual_direction },
  { path: 'motion_intent', value: brief => brief.motion_intent },
  { path: 'narrative_arc', value: brief => brief.narrative_arc }
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateOptionalString(record: Record<string, unknown>, field: string): void {
  if (record[field] !== undefined && typeof record[field] !== 'string') {
    throw new Error(`${BRIEF_FILENAME}: ${field} must be a string`);
  }
}

function validateDeckBrief(value: unknown): DeckBrief {
  if (!isObject(value)) {
    throw new Error(`${BRIEF_FILENAME} must contain a JSON object`);
  }
  if (value.schema !== undefined && value.schema !== 'deckmark/brief/v1') {
    throw new Error(`${BRIEF_FILENAME}: schema must be deckmark/brief/v1`);
  }
  for (const field of [
    'setting', 'purpose', 'key_takeaway', 'desired_action', 'tone',
    'visual_direction', 'motion_intent', 'narrative_arc'
  ]) {
    validateOptionalString(value, field);
  }
  if (value.audience !== undefined) {
    if (!isObject(value.audience)) {
      throw new Error(`${BRIEF_FILENAME}: audience must be an object`);
    }
    validateOptionalString(value.audience, 'description');
    validateOptionalString(value.audience, 'familiarity');
    for (const field of ['needs', 'objections']) {
      const list = value.audience[field];
      if (list !== undefined && (!Array.isArray(list) || list.some(item => typeof item !== 'string'))) {
        throw new Error(`${BRIEF_FILENAME}: audience.${field} must be an array of strings`);
      }
    }
  }
  if (value.quality !== undefined) {
    if (!isObject(value.quality)) {
      throw new Error(`${BRIEF_FILENAME}: quality must be an object`);
    }
    if (
      value.quality.mode !== undefined &&
      value.quality.mode !== 'advisory' &&
      value.quality.mode !== 'blocking'
    ) {
      throw new Error(`${BRIEF_FILENAME}: quality.mode must be advisory or blocking`);
    }
    if (
      value.quality.target !== undefined &&
      (
        typeof value.quality.target !== 'number' ||
        !Number.isFinite(value.quality.target) ||
        value.quality.target < 1 ||
        value.quality.target > 10
      )
    ) {
      throw new Error(`${BRIEF_FILENAME}: quality.target must be a number from 1 to 10`);
    }
  }
  return value as DeckBrief;
}

export async function readDeckBrief(deckDir: string): Promise<{
  brief: DeckBrief;
  briefHash: string;
  exists: boolean;
  missing: string[];
}> {
  let raw: string;
  try {
    raw = await readFile(join(deckDir, BRIEF_FILENAME), 'utf8');
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') {
      return {
        brief: {},
        briefHash: 'sha256:missing',
        exists: false,
        missing: REQUIRED_FIELDS.map(field => field.path)
      };
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${BRIEF_FILENAME} is not valid JSON`);
  }
  const brief = validateDeckBrief(parsed);

  const missing = REQUIRED_FIELDS
    .filter(field => {
      const value = field.value(brief);
      return typeof value !== 'string' || value.trim().length === 0;
    })
    .map(field => field.path);

  return { brief, briefHash: contentHash(raw), exists: true, missing };
}

export function qualityMode(brief: DeckBrief): QualityMode {
  return brief.quality?.mode === 'blocking' ? 'blocking' : 'advisory';
}

export function qualityTarget(brief: DeckBrief): number {
  const target = brief.quality?.target;
  if (typeof target !== 'number' || !Number.isFinite(target)) return 8;
  return Math.min(10, Math.max(1, target));
}
