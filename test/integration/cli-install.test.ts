// test/integration/cli-install.test.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// We monkey-patch os.homedir via env var override pattern: install/uninstall
// read homedir() at call time, so we set HOME / USERPROFILE to a temp dir.
async function withFakeHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  const home = await mkdtemp(join(tmpdir(), 'deckmark-home-'));
  const origHome = process.env.HOME;
  const origUserProfile = process.env.USERPROFILE;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  try {
    return await fn(home);
  } finally {
    process.env.HOME = origHome;
    process.env.USERPROFILE = origUserProfile;
    await rm(home, { recursive: true, force: true });
  }
}

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

test('install + uninstall round-trip writes and removes all artifacts', async () => {
  await withFakeHome(async (home) => {
    const { install } = await import('../../cli/install.ts');
    const { uninstall } = await import('../../cli/uninstall.ts');

    await install({ scope: 'global', force: false });

    const cfgPath = join(home, '.claude.json');
    const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
    assert.deepEqual(cfg.mcpServers.deckmark, {
      command: 'npx',
      args: ['-y', '--package', 'deckmark', 'deckmark-mcp']
    });

    assert.ok(await exists(join(home, '.claude', 'skills', 'deckmark', 'SKILL.md')));
    assert.ok(await exists(join(home, '.claude', 'commands', 'use-deckmark.md')));

    await uninstall({ scope: 'global', force: false });

    const cfgAfter = JSON.parse(await readFile(cfgPath, 'utf8'));
    assert.equal(cfgAfter.mcpServers.deckmark, undefined);
    assert.equal(await exists(join(home, '.claude', 'skills', 'deckmark')), false);
    assert.equal(await exists(join(home, '.claude', 'commands', 'use-deckmark.md')), false);
  });
});

test('install refuses to overwrite different MCP entry without --force', async () => {
  await withFakeHome(async (home) => {
    const cfgPath = join(home, '.claude.json');
    await writeFile(
      cfgPath,
      JSON.stringify({
        mcpServers: { deckmark: { command: 'something-else' } }
      })
    );

    const { install } = await import('../../cli/install.ts');
    await assert.rejects(() => install({ scope: 'global', force: false }), /already set/);
  });
});

test('install --force overwrites different MCP entry', async () => {
  await withFakeHome(async (home) => {
    const cfgPath = join(home, '.claude.json');
    await writeFile(
      cfgPath,
      JSON.stringify({ mcpServers: { deckmark: { command: 'something-else' } } })
    );

    const { install } = await import('../../cli/install.ts');
    await install({ scope: 'global', force: true });

    const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
    assert.deepEqual(cfg.mcpServers.deckmark, {
      command: 'npx',
      args: ['-y', '--package', 'deckmark', 'deckmark-mcp']
    });
  });
});

test('install is idempotent when entry already matches', async () => {
  await withFakeHome(async (home) => {
    const { install } = await import('../../cli/install.ts');
    await install({ scope: 'global', force: false });
    // Second call should not throw and should leave files in place.
    await install({ scope: 'global', force: true });
    const cfg = JSON.parse(await readFile(join(home, '.claude.json'), 'utf8'));
    assert.deepEqual(cfg.mcpServers.deckmark, {
      command: 'npx',
      args: ['-y', '--package', 'deckmark', 'deckmark-mcp']
    });
  });
});
