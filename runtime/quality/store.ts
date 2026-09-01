import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { QualityReport } from './types.ts';

function qualityDir(deckDir: string): string {
  return join(deckDir, '.deckmark', 'quality');
}

async function atomicWrite(path: string, value: string): Promise<void> {
  const tmp = `${path}.${randomUUID()}.tmp`;
  await writeFile(tmp, value, 'utf8');
  await rename(tmp, path);
}

export async function writeQualityReport(deckDir: string, report: QualityReport): Promise<string> {
  const dir = qualityDir(deckDir);
  await mkdir(dir, { recursive: true });
  const stamp = report.created_at.replace(/[:.]/g, '-');
  const path = join(dir, `report-${stamp}.json`);
  const json = JSON.stringify(report, null, 2);
  await atomicWrite(path, json);
  await atomicWrite(join(dir, 'latest.json'), json);
  return path;
}

export async function readLatestQualityReport(deckDir: string): Promise<QualityReport | null> {
  try {
    const raw = await readFile(join(qualityDir(deckDir), 'latest.json'), 'utf8');
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error('latest deck quality report is not valid JSON; run audit_deck again');
    }
    return validateQualityReport(value);
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return null;
    throw err;
  }
}

function validateQualityReport(value: unknown): QualityReport {
  if (!value || typeof value !== 'object') {
    throw new Error('latest deck quality report is invalid; run audit_deck again');
  }
  const report = value as Partial<QualityReport>;
  if (
    report.schema !== 'deckmark/quality-report/v1' ||
    typeof report.run_id !== 'string' ||
    typeof report.build_hash !== 'string' ||
    typeof report.content_file !== 'string' ||
    report.content_file.length === 0 ||
    typeof report.content_hash !== 'string' ||
    typeof report.brief_hash !== 'string' ||
    typeof report.packet_hash !== 'string' ||
    typeof report.target !== 'number' ||
    typeof report.iteration !== 'number' ||
    typeof report.overall_score !== 'number' ||
    typeof report.beauty_score !== 'number' ||
    typeof report.audience_score !== 'number' ||
    (report.mode !== 'advisory' && report.mode !== 'blocking') ||
    (report.verdict !== 'accept' && report.verdict !== 'revise') ||
    !report.reviewer ||
    (report.reviewer.method !== 'different-model' && report.reviewer.method !== 'cold-self-review') ||
    typeof report.reviewer.independent !== 'boolean' ||
    !Array.isArray(report.artifacts) ||
    report.artifacts.some(artifact => typeof artifact.sha256 !== 'string') ||
    !Array.isArray(report.floor_failures) ||
    !Array.isArray(report.deterministic_findings) ||
    !Array.isArray(report.critic_findings) ||
    !Array.isArray(report.audience_reception) ||
    !report.stop ||
    typeof report.stop.stop !== 'boolean'
  ) {
    throw new Error('latest deck quality report has an invalid schema; run audit_deck again');
  }
  return report as QualityReport;
}
