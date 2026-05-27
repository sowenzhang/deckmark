// cli/copy.ts
import { cp, mkdir, rm, copyFile as nodeCopyFile, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';

export interface CopyOptions {
  force: boolean;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw e;
  }
}

export async function copyDir(src: string, dest: string, opts: CopyOptions): Promise<void> {
  const destExists = await exists(dest);
  if (destExists && !opts.force) {
    throw new Error(`destination already exists: ${dest} (use --force to overwrite)`);
  }
  if (destExists && opts.force) {
    await rm(dest, { recursive: true, force: true });
  }
  await cp(src, dest, { recursive: true });
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
