// test/integration/mcp-flow.test.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, writeFile, readFile, stat, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..', '..');
const SERVER_ENTRY = join(REPO, 'dist', 'mcp', 'server.js');

interface RpcClient {
  proc: ChildProcessWithoutNullStreams;
  call: (method: string, params?: object) => Promise<unknown>;
  close: () => Promise<void>;
}

function startServer(): RpcClient {
  const proc = spawn(process.execPath, [SERVER_ENTRY], {
    stdio: ['pipe', 'pipe', 'inherit']
  });
  let buf = '';
  let id = 0;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
  proc.stdout.on('data', (chunk: Buffer) => {
    buf += chunk.toString();
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line) as { id?: number; result?: unknown; error?: unknown };
        if (msg.id !== undefined) {
          const p = pending.get(msg.id);
          if (p) {
            pending.delete(msg.id);
            if (msg.error) p.reject(msg.error);
            else p.resolve(msg.result);
          }
        }
      } catch { /* ignore non-JSON */ }
    }
  });
  return {
    proc,
    call: (method, params = {}) => new Promise((res, rej) => {
      const myId = ++id;
      pending.set(myId, { resolve: res, reject: rej });
      proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: myId, method, params }) + '\n');
    }),
    close: () => new Promise<void>((r) => {
      proc.on('exit', () => r());
      proc.kill();
      setTimeout(() => r(), 2000);
    })
  };
}

test('full MCP flow: init → build → start_review → POST annotation → get_annotations → publish_deck', async (t) => {
  // dist/ must exist
  await access(SERVER_ENTRY).catch(() => { throw new Error('run `npm run build` before this test'); });

  const dir = await mkdtemp(join(tmpdir(), 'dm-mcp-'));
  const slug = 'mydeck';
  const deckDir = join(dir, slug);
  t.after(async () => { await rm(dir, { recursive: true, force: true }); });

  const client = startServer();
  t.after(async () => { await client.close(); });

  // initialize
  await client.call('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'mcp-flow-test', version: '0.0.1' }
  });

  // Set cwd via process.chdir is not possible across MCP boundary; instead, all tool inputs use `dir`.
  const initRes = await client.call('tools/call', {
    name: 'init_deck',
    arguments: { dir: deckDir, agent: 'generic' }
  }) as { content: Array<{ text: string }> };
  const initOut = JSON.parse(initRes.content[0].text) as { path: string; content_file: string };
  assert.equal(initOut.path, deckDir);
  await access(initOut.content_file);

  // Write a minimal content.md
  await writeFile(join(deckDir, 'content.md'), '# Hello\n\nWorld.\n\n---\n\n# Two\n\nThings.\n');

  // build
  const buildRes = await client.call('tools/call', {
    name: 'build_deck',
    arguments: { dir: deckDir }
  }) as { content: Array<{ text: string }> };
  const buildOut = JSON.parse(buildRes.content[0].text) as { slide_count: number };
  assert.equal(buildOut.slide_count, 2);
  await access(join(deckDir, 'build', 'index.html'));

  // start_review
  const startRes = await client.call('tools/call', {
    name: 'start_review',
    arguments: { dir: deckDir }
  }) as { content: Array<{ text: string }> };
  const startOut = JSON.parse(startRes.content[0].text) as { url: string; session_id: string };
  assert.match(startOut.url, /^http:\/\/127\.0\.0\.1:\d+$/);

  // starting a new review for the same deck should close the old server first
  const startRes2 = await client.call('tools/call', {
    name: 'start_review',
    arguments: { dir: deckDir }
  }) as { content: Array<{ text: string }> };
  const startOut2 = JSON.parse(startRes2.content[0].text) as { url: string; session_id: string };
  assert.notEqual(startOut2.session_id, startOut.session_id);
  const oldStop = await client.call('tools/call', {
    name: 'stop_review',
    arguments: { session_id: startOut.session_id }
  }) as { content: Array<{ text: string }> };
  const oldStopOut = JSON.parse(oldStop.content[0].text) as { stopped: boolean };
  assert.equal(oldStopOut.stopped, false);

  // POST an annotation via HTTP
  const post = await fetch(`${startOut2.url}/api/annotations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      slide: { index: 0, id: 'hello', title: 'Hello' },
      element: {
        selector: 'h1', dom_path: 'h1', tag: 'h1', text: 'Hello',
        bbox: { x: 0, y: 0, w: 100, h: 50 }
      },
      comment: 'make it bigger'
    })
  });
  assert.equal(post.status, 200);

  // get_annotations
  const getRes = await client.call('tools/call', {
    name: 'get_annotations',
    arguments: { dir: deckDir, format: 'md' }
  }) as { content: Array<{ text: string }> };
  const getOut = JSON.parse(getRes.content[0].text) as { text: string };
  assert.match(getOut.text, /make it bigger/);

  // publish_deck (single-file)
  const pubRes = await client.call('tools/call', {
    name: 'publish_deck',
    arguments: { dir: deckDir, mode: 'single-file' }
  }) as { content: Array<{ text: string }> };
  const pubOut = JSON.parse(pubRes.content[0].text) as { out: string; bytes: number };
  await access(pubOut.out);
  assert.ok(pubOut.bytes > 100_000, `single-file should be sizable, got ${pubOut.bytes}`);

  // stop_review
  await client.call('tools/call', {
    name: 'stop_review',
    arguments: { session_id: startOut2.session_id }
  });
});
