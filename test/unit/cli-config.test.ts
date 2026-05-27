// test/unit/cli-config.test.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConfig, writeConfigAtomic, setMcpEntry, removeMcpEntry } from '../../cli/config.ts';

async function tmp() {
  return await mkdtemp(join(tmpdir(), 'deckmark-cfg-'));
}

test('readConfig returns {} when file does not exist', async () => {
  const dir = await tmp();
  const got = await readConfig(join(dir, 'nope.json'));
  assert.deepEqual(got, {});
  await rm(dir, { recursive: true, force: true });
});

test('readConfig parses existing JSON', async () => {
  const dir = await tmp();
  const p = join(dir, 'c.json');
  await writeFile(p, JSON.stringify({ mcpServers: { x: { command: 'foo' } } }));
  const got = await readConfig(p);
  assert.deepEqual(got, { mcpServers: { x: { command: 'foo' } } });
  await rm(dir, { recursive: true, force: true });
});

test('readConfig throws on invalid JSON without modifying file', async () => {
  const dir = await tmp();
  const p = join(dir, 'bad.json');
  await writeFile(p, '{ not valid');
  await assert.rejects(() => readConfig(p), /Invalid JSON/);
  // Original content untouched
  assert.equal(await readFile(p, 'utf8'), '{ not valid');
  await rm(dir, { recursive: true, force: true });
});

test('writeConfigAtomic writes JSON with trailing newline', async () => {
  const dir = await tmp();
  const p = join(dir, 'out.json');
  await writeConfigAtomic(p, { hello: 'world' });
  const text = await readFile(p, 'utf8');
  assert.equal(text, '{\n  "hello": "world"\n}\n');
  await rm(dir, { recursive: true, force: true });
});

test('setMcpEntry adds entry preserving other keys', () => {
  const cfg = { otherKey: 1, mcpServers: { existing: { command: 'x' } } };
  const next = setMcpEntry(cfg, 'deckmark', { command: 'npx', args: ['-y', 'deckmark-mcp'] });
  assert.deepEqual(next, {
    otherKey: 1,
    mcpServers: {
      existing: { command: 'x' },
      deckmark: { command: 'npx', args: ['-y', 'deckmark-mcp'] }
    }
  });
});

test('setMcpEntry creates mcpServers when missing', () => {
  const cfg = {};
  const next = setMcpEntry(cfg, 'deckmark', { command: 'npx', args: ['-y', 'deckmark-mcp'] });
  assert.deepEqual(next, {
    mcpServers: { deckmark: { command: 'npx', args: ['-y', 'deckmark-mcp'] } }
  });
});

test('removeMcpEntry removes key, leaves empty mcpServers object', () => {
  const cfg = { mcpServers: { deckmark: { command: 'x' } } };
  const next = removeMcpEntry(cfg, 'deckmark');
  assert.deepEqual(next, { mcpServers: {} });
});

test('removeMcpEntry on missing key is a no-op', () => {
  const cfg = { mcpServers: { other: { command: 'x' } } };
  const next = removeMcpEntry(cfg, 'deckmark');
  assert.deepEqual(next, { mcpServers: { other: { command: 'x' } } });
});
