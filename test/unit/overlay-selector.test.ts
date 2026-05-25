import { test } from 'node:test';
import { strict as assert } from 'node:assert';

test('selector module exports getStableSelector', async () => {
  const mod = await import('../../runtime/overlay/selector.ts');
  assert.equal(typeof mod.getStableSelector, 'function');
});
