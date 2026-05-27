// cli/copy.ts
import { cp, mkdir, copyFile as nodeCopyFile, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';

export interface CopyOptions {
  force: boolean;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function copyDir(src: string, dest: string, opts: CopyOptions): Promise<void> {
  if (!opts.force && (await exists(dest))) {
    throw new Error(`destination already exists: ${dest} (use --force to overwrite)`);
  }
  await cp(src, dest, { recursive: true, force: true });
}

export async function copyFile(src: string, dest: string, opts: CopyOptions): Promise<void> {
  if (!opts.force && (await exists(dest))) {
    throw new Error(`destination already exists: ${dest} (use --force to overwrite)`);
  }
  await mkdir(dirname(dest), { recursive: true });
  await nodeCopyFile(src, dest);
}

export async function fileHash(path: string): Promise<string> {
  const buf = await readFile(path);
  return createHash('sha256').update(buf).digest('hex');
}
