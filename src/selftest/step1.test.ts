/**
 * src/selftest/step1.test.ts
 * Automated unit test suite verifying Step 1 foundation requirements.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runStep1SelfTests } from './runner';

test('Step 1 Self-Tests Suite: All 4 acceptance tests must pass', async () => {
  const results = await runStep1SelfTests();

  assert.equal(results.length, 4, 'Should execute exactly 4 tests for Step 1');

  for (const r of results) {
    assert.equal(r.passed, true, `Test "${r.title}" failed: ${r.details.join('; ')}`);
  }
});
