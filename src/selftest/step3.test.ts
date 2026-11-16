/**
 * src/selftest/step3.test.ts
 * Automated unit test suite verifying Step 1, Step 2, and Step 3 requirements (Tests 1 through 15).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runStep1SelfTests } from './runner';

test('Step 3 Self-Tests Suite: All 15 acceptance tests must pass', async () => {
  const results = await runStep1SelfTests();

  assert.equal(results.length, 15, 'Should execute exactly 15 tests (Step 1 + Step 2 + Step 3)');

  for (const r of results) {
    assert.equal(r.passed, true, `Test "${r.title}" failed: ${r.details.join('; ')} - ${r.error || ''}`);
  }
});
