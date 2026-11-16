/**
 * src/selftest/step4.test.ts
 * Automated unit test suite verifying Step 1, Step 2, Step 3, and Step 4 requirements (Tests 1 through 18).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runStep1SelfTests } from './runner';

test('Step 4 Self-Tests Suite: All 18 acceptance tests must pass', async () => {
  const results = await runStep1SelfTests();

  assert.equal(results.length, 18, 'Should execute exactly 18 tests (Step 1 + Step 2 + Step 3 + Step 4)');

  for (const r of results) {
    assert.equal(r.passed, true, `Test "${r.title}" failed: ${r.details.join('; ')} - ${r.error || ''}`);
  }
});
