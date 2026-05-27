// test/unit/cli-argv.test.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseArgs } from '../../cli/argv.ts';

test('parses bare install as global non-force', () => {
  const cmd = parseArgs(['install']);
  assert.deepEqual(cmd, { kind: 'install', options: { scope: 'global', force: false } });
});

test('parses install --project as project scope', () => {
  const cmd = parseArgs(['install', '--project']);
  assert.deepEqual(cmd, { kind: 'install', options: { scope: 'project', force: false } });
});

test('parses install --force', () => {
  const cmd = parseArgs(['install', '--force']);
  assert.deepEqual(cmd, { kind: 'install', options: { scope: 'global', force: true } });
});

test('parses install --project --force in any order', () => {
  const a = parseArgs(['install', '--project', '--force']);
  const b = parseArgs(['install', '--force', '--project']);
  assert.deepEqual(a, b);
  assert.equal(a.kind, 'install');
});

test('parses uninstall same as install', () => {
  const cmd = parseArgs(['uninstall', '--project']);
  assert.deepEqual(cmd, { kind: 'uninstall', options: { scope: 'project', force: false } });
});

test('parses --help', () => {
  assert.deepEqual(parseArgs(['--help']), { kind: 'help' });
  assert.deepEqual(parseArgs(['-h']), { kind: 'help' });
});

test('parses --version', () => {
  assert.deepEqual(parseArgs(['--version']), { kind: 'version' });
  assert.deepEqual(parseArgs(['-v']), { kind: 'version' });
});

test('no args yields help', () => {
  assert.deepEqual(parseArgs([]), { kind: 'help' });
});

test('unknown subcommand yields error', () => {
  const cmd = parseArgs(['frobnicate']);
  assert.equal(cmd.kind, 'error');
});

test('unknown flag yields error', () => {
  const cmd = parseArgs(['install', '--unknown']);
  assert.equal(cmd.kind, 'error');
});
