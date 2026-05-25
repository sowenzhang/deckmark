// test/unit/build-hash.test.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildHash } from '../../runtime/store/build-hash.ts';

async function tmpDir() {
  return await mkdtemp(join(tmpdir(), 'deckmark-bh-'));
}

test('buildHash is deterministic for identical inputs', async () => {
  const a = await tmpDir();
  const b = await tmpDir();
  for (const dir of [a, b]) {
    await mkdir(join(dir, 'sub'), { recursive: true });
    await writeFile(join(dir, 'a.txt'), 'hello');
    await writeFile(join(dir, 'sub', 'b.txt'), 'world');
  }
  const ha = await buildHash(a);
  const hb = await buildHash(b);
  assert.equal(ha, hb);
  assert.match(ha, /^sha256:[a-f0-9]{64}$/);
  await rm(a, { recursive: true });
  await rm(b, { recursive: true });
});

test('buildHash changes when a file changes', async () => {
  const dir = await tmpDir();
  await writeFile(join(dir, 'a.txt'), 'one');
  const h1 = await buildHash(dir);
  await writeFile(join(dir, 'a.txt'), 'two');
  const h2 = await buildHash(dir);
  assert.notEqual(h1, h2);
  await rm(dir, { recursive: true });
});

test('buildHash changes when a file is added', async () => {
  const dir = await tmpDir();
  await writeFile(join(dir, 'a.txt'), 'x');
  const h1 = await buildHash(dir);
  await writeFile(join(dir, 'b.txt'), 'y');
  const h2 = await buildHash(dir);
  assert.notEqual(h1, h2);
  await rm(dir, { recursive: true });
});

test('buildHash returns sha256:empty for non-existent directory', async () => {
  const missing = join(tmpdir(), `deckmark-bh-missing-${Date.now()}`);
  const h = await buildHash(missing);
  assert.equal(h, 'sha256:empty');
});
