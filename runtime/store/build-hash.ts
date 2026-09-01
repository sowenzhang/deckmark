// src/store/build-hash.ts
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else if (e.isFile()) out.push(full);
  }
  return out;
}

export async function buildHash(dir: string): Promise<string> {
  try {
    await stat(dir);
  } catch {
    return 'sha256:empty';
  }
  const files = (await walk(dir)).sort();
  const hash = createHash('sha256');
  for (const file of files) {
    const rel = file.slice(dir.length + 1).replace(/\\/g, '/');
    hash.update(rel);
    hash.update('\0');
    hash.update(await readFile(file));
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

export function dataHash(data: string | Buffer): string {
  return `sha256:${createHash('sha256').update(data).digest('hex')}`;
}

export function contentHash(content: string): string {
  return dataHash(content);
}
