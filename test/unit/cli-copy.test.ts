// test/unit/cli-copy.test.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, mkdir, writeFile, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copyDir, copyFile, fileHash } from '../../cli/copy.ts';

async function tmp() {
  return await mkdtemp(join(tmpdir(), 'deckmark-cp-'));
}

test('copyDir copies a folder recursively', async () => {
  const src = await tmp();
  const dest = join(await tmp(), 'dest');
  await mkdir(join(src, 'sub'), { recursive: true });
  await writeFile(join(src, 'a.txt'), 'A');
  await writeFile(join(src, 'sub', 'b.txt'), 'B');

  await copyDir(src, dest, { force: false });

  assert.equal(await readFile(join(dest, 'a.txt'), 'utf8'), 'A');
  assert.equal(await readFile(join(dest, 'sub', 'b.txt'), 'utf8'), 'B');
  await rm(src, { recursive: true, force: true });
  await rm(dest, { recursive: true, force: true });
});

test('copyDir refuses to overwrite when dest exists and force=false', async () => {
  const src = await tmp();
  const dest = await tmp();
  await writeFile(join(src, 'a.txt'), 'new');
  await writeFile(join(dest, 'sentinel'), 'keep');

  await assert.rejects(
    () => copyDir(src, dest, { force: false }),
    /already exists/
  );
  // Existing file untouched
  assert.equal(await readFile(join(dest, 'sentinel'), 'utf8'), 'keep');
  await rm(src, { recursive: true, force: true });
  await rm(dest, { recursive: true, force: true });
});

test('copyDir overwrites when force=true', async () => {
  const src = await tmp();
  const dest = await tmp();
  await writeFile(join(src, 'a.txt'), 'new');
  await writeFile(join(dest, 'a.txt'), 'old');

  await copyDir(src, dest, { force: true });

  assert.equal(await readFile(join(dest, 'a.txt'), 'utf8'), 'new');
  await rm(src, { recursive: true, force: true });
  await rm(dest, { recursive: true, force: true });
});

test('copyFile creates parent directory', async () => {
  const dir = await tmp();
  const src = join(dir, 'src.md');
  await writeFile(src, 'hello');
  const dest = join(dir, 'new', 'nested', 'dest.md');

  await copyFile(src, dest, { force: false });

  assert.equal(await readFile(dest, 'utf8'), 'hello');
  await rm(dir, { recursive: true, force: true });
});

test('copyFile refuses to overwrite when dest exists and force=false', async () => {
  const dir = await tmp();
  const src = join(dir, 'src.md');
  const dest = join(dir, 'dest.md');
  await writeFile(src, 'new');
  await writeFile(dest, 'old');

  await assert.rejects(() => copyFile(src, dest, { force: false }), /already exists/);
  assert.equal(await readFile(dest, 'utf8'), 'old');
  await rm(dir, { recursive: true, force: true });
});

test('copyDir with force=true removes stale files from dest', async () => {
  const src = await tmp();
  const dest = await tmp();
  await writeFile(join(src, 'new.txt'), 'new');
  await writeFile(join(dest, 'stale.txt'), 'stale');

  await copyDir(src, dest, { force: true });

  assert.equal(await readFile(join(dest, 'new.txt'), 'utf8'), 'new');
  await assert.rejects(() => readFile(join(dest, 'stale.txt'), 'utf8'));
  await rm(src, { recursive: true, force: true });
  await rm(dest, { recursive: true, force: true });
});

test('fileHash produces stable sha256 for same content', async () => {
  const dir = await tmp();
  const p = join(dir, 'a.txt');
  await writeFile(p, 'hello');
  const h1 = await fileHash(p);
  const h2 = await fileHash(p);
  assert.equal(h1, h2);
  assert.match(h1, /^[a-f0-9]{64}$/);
  await rm(dir, { recursive: true, force: true });
});
