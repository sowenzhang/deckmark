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

  let brief: DeckBrief;
  try {
    brief = JSON.parse(raw) as DeckBrief;
  } catch {
    throw new Error(`${BRIEF_FILENAME} is not valid JSON`);
  }

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
