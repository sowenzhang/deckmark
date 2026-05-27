// test/unit/cli-paths.test.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { configPath, skillsDir, commandsDir, skillName } from '../../cli/paths.ts';

test('configPath returns ~/.claude.json for global scope', () => {
  assert.equal(configPath('global'), join(homedir(), '.claude.json'));
});

test('configPath returns ./.mcp.json for project scope', () => {
  assert.equal(configPath('project'), join(process.cwd(), '.mcp.json'));
});

test('skillsDir returns ~/.claude/skills for global scope', () => {
  assert.equal(skillsDir('global'), join(homedir(), '.claude', 'skills'));
});

test('skillsDir returns ./.claude/skills for project scope', () => {
  assert.equal(skillsDir('project'), join(process.cwd(), '.claude', 'skills'));
});

test('commandsDir returns ~/.claude/commands for global scope', () => {
  assert.equal(commandsDir('global'), join(homedir(), '.claude', 'commands'));
});

test('commandsDir returns ./.claude/commands for project scope', () => {
  assert.equal(commandsDir('project'), join(process.cwd(), '.claude', 'commands'));
});

test('skillName is the literal "deckmark"', () => {
  assert.equal(skillName, 'deckmark');
});
