import assert from 'node:assert/strict';
// @vitest-environment node
import { it as test } from 'vitest';
import { diagnoseFriXCTest, currentFriDiagnosis, describeFriFailure } from './fri-xctest-diagnosis.mjs';

const timeout = 'Timed out while enabling automation mode.';
const started = "Test Case '-[AppPhysicalUITests.ExampleTests testExample]' started.";
const diagnosis = diagnoseFriXCTest({ log: timeout, xcodeStatus: 65 });
const start = { event: 'fri-run-started', invocationId: 'current' };
const completed = { event: 'fri-run-completed', invocationId: 'current', diagnosis };
const output = (...records) => records.map((record) => JSON.stringify(record)).join('\n');

test('runner initialization failures are not product methods or assertions', () => {
  const result = diagnoseFriXCTest({ xcodeStatus: 65,
    log: 'Running tests...\n' + timeout,
    summary: { totalTestCount: 1, testFailures: [{ targetName: 'AppPhysicalUITests',
      testIdentifierString: 'AppPhysicalUITests-Runner (1) encountered an error', failureText: timeout }] } });
  assert.equal(result.methodsStarted.length, 0);
  assert.ok(result.failures.every(({ kind }) => kind === 'automation-startup'));
});

test('method starts and later channel failures remain separate facts', () => {
  const result = diagnoseFriXCTest({ log: started + '\nConnection peer refused channel request for "dtxproxy:XCTestDriverInterface:XCTestManager_IDEInterface"' });
  assert.equal(result.methodsStarted[0].identifier, 'AppPhysicalUITests/ExampleTests/testExample');
  assert.equal(result.failures[0].kind, 'automation-channel');
});

test('a passing method cannot hide another target startup failure or a later attempt', () => {
  const result = diagnoseFriXCTest({ log: started + '\n' + started + '\nOtherTests-Runner[2:3] Running tests...\nOtherTests-Runner[2:3] ' + timeout });
  assert.deepEqual(result.methodsStarted.map(({ attempt }) => attempt), [1, 2]);
  assert.equal(result.failures[0].target, 'OtherTests');
  assert.equal(result.failures[0].attempt, 1);
});

test('a method start from an earlier runner attempt does not hide a later initialization failure', () => {
  const runner = 'AppPhysicalUITests-Runner[1:1] ';
  const result = diagnoseFriXCTest({ log: runner + 'Running tests...\n' + started + '\n' +
    runner + 'Running tests...\n' + runner + timeout });
  assert.equal(result.methodsStarted.length, 1);
  assert.equal(result.failures[0].attempt, 2);
});

test('assertion failures do not claim a product root cause', () => {
  const result = diagnoseFriXCTest({ log: started, summary: {
    testFailures: [{ failureText: 'XCTAssertTrue failed: button absent', testIdentifierString: 'ExampleTests/testExample()' }] } });
  assert.equal(result.failures[0].kind, 'test-failure');
});

test('post-test failures and explicit automation failures are all retained', () => {
  const result = diagnoseFriXCTest({ log: timeout, xcodeStatus: 65,
    keepStatus: 6, summaryStatus: 1, attachmentsStatus: 2 });
  assert.deepEqual(result.failures.map(({ kind }) => kind),
    ['automation-startup', 'foreground-restore', 'evidence-summary', 'evidence-attachments']);
});

test('missing evidence does not imply automation or product failure', () => {
  assert.equal(diagnoseFriXCTest({ xcodeStatus: 65 }).failures[0].kind, 'unknown');
  assert.equal(diagnoseFriXCTest({ action: 'build-for-testing', xcodeStatus: 65 }).failures[0].kind, 'build-command');
  assert.equal(diagnoseFriXCTest({ summary: { testFailures: 'corrupt' } }).failures.length, 0);
});

test('known signing and install failures retain their own stages', () => {
  assert.equal(diagnoseFriXCTest({ log: 'Failed to install the app on the device' }).failures[0].kind, 'app-install');
  assert.equal(diagnoseFriXCTest({ log: 'Command CodeSign failed with a nonzero exit code' }).failures[0].kind, 'signing');
});

test('only a unique matching start and completion can supply current diagnosis', () => {
  assert.equal(currentFriDiagnosis(output(start, completed)).invocationId, 'current');
  for (const records of [[completed], [start], [start, { ...completed, invocationId: 'old' }],
    [start, completed, completed], [start, start, completed], [start, { ...completed, diagnosis: {} }]]) {
    assert.equal(currentFriDiagnosis(output(...records)), null);
  }
});

test('outer interruption is authoritative while completed observations are retained', () => {
  const result = describeFriFailure({ output: output(start, completed), code: 124,
    terminationReason: 'hard_deadline' });
  assert.match(result.message, /interrupted.*hard_deadline.*automation-startup/u);
  assert.match(describeFriFailure({ output: output(start), code: 124,
    childSignal: 'SIGKILL' }).message, /SIGKILL.*unknown/u);
  const partial = describeFriFailure({ output: output(start) + '\n' + timeout,
    code: 124, childSignal: 'SIGKILL' });
  assert.match(partial.message, /SIGKILL.*automation-startup/u);
  assert.equal(partial.diagnosticComplete, false);
  assert.match(describeFriFailure({ output: output(completed), code: 65 }).message, /unknown/u);
});
