/**
 * src/selftest/step6.test.ts
 * Automated unit test suite verifying all 24 acceptance tests across Steps 1 through 6.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runStep1SelfTests } from './runner';

test('Step 6 Complete Master Self-Tests Suite: All 24 acceptance tests must pass', async () => {
  const results = await runStep1SelfTests();

  console.log(`Executed ${results.length} self-tests:`);
  results.forEach((r, idx) => {
    console.log(`  [Test ${idx + 1}] ${r.title} => ${r.passed ? 'PASS' : 'FAIL'} (${r.durationMs}ms)`);
    if (!r.passed) {
      console.error(`    Error: ${r.error}`);
    }
  });

  assert.equal(results.length, 24, 'Should execute exactly 24 tests (Steps 1 through 6)');

  for (const r of results) {
    assert.equal(r.passed, true, `Test "${r.title}" failed: ${r.details.join('; ')} - ${r.error || ''}`);
  }
});
