/**
 * src/selftest/step7.test.ts
 * Automated unit test suite verifying all 28 acceptance tests across Steps 1 through 7.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runStep1SelfTests } from './runner';

test('Step 7 Complete Master Self-Tests Suite: All 28 acceptance tests must pass', async () => {
  const results = await runStep1SelfTests();

  console.log(`Executed ${results.length} self-tests:`);
  results.forEach((r, idx) => {
    console.log(`  [Test ${idx + 1}] ${r.title} => ${r.passed ? 'PASS' : 'FAIL'} (${r.durationMs}ms)`);
    if (!r.passed) {
      console.error(`    Error: ${r.error}`);
    }
  });

  assert.equal(results.length, 28, 'Should execute exactly 28 tests (Steps 1 through 7)');

  for (const r of results) {
    assert.equal(r.passed, true, `Test "${r.title}" failed: ${r.details.join('; ')} - ${r.error || ''}`);
  }
});
