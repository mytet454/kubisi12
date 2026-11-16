/**
 * src/selftest/step2.test.ts
 * Automated unit test suite verifying Step 1 & Step 2 requirements (Tests 1 through 8).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runStep1SelfTests } from './runner';

test('Step 2 Self-Tests Suite: All 8 acceptance tests must pass', async () => {
  const results = await runStep1SelfTests();

  assert.equal(results.length, 8, 'Should execute exactly 8 tests (4 Step 1 + 4 Step 2)');

  for (const r of results) {
    assert.equal(r.passed, true, `Test "${r.title}" failed: ${r.details.join('; ')} - ${r.error || ''}`);
  }
});
