#!/usr/bin/env node
// scripts/run-tests.mjs
// Cross-platform test runner. Globs *.test.ts files via Node's native
// fs.glob (Node 22+), then spawns `node --import tsx --test <files...>`.
//
// Why this exists: passing a bare glob string to node --test makes node
// try to import the literal pattern. Passing a directory makes tsx's
// resolver try to read it as a module. Listing explicit files is the
// only universally-portable approach.

import { glob } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const subdir = process.argv[2] ?? 'test';
const pattern = `${subdir.replaceAll('\\', '/')}/**/*.test.ts`;

const files = [];
for await (const file of glob(pattern, { cwd: repoRoot })) {
  files.push(file);
}

if (files.length === 0) {
  console.error(`No test files matched ${pattern} under ${repoRoot}`);
  process.exit(1);
}

files.sort();
console.log(`Running ${files.length} test file(s):`);
for (const f of files) console.log(`  ${f}`);

const proc = spawn(
  process.execPath,
  ['--import', 'tsx', '--test', '--test-reporter=spec', ...files],
  { stdio: 'inherit', cwd: repoRoot }
);

proc.on('exit', (code) => process.exit(code ?? 1));
proc.on('error', (err) => {
  console.error(err);
  process.exit(1);
});
