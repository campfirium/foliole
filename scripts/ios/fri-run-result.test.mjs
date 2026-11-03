// @vitest-environment node
import { expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { assertFriRunSucceeded } from './fri-run-result.mjs';

function output(invocationId = 'current', completedId = invocationId) {
  return [JSON.stringify({ event: 'fri-run-started', invocationId }),
    JSON.stringify({ event: 'fri-run-completed', invocationId: completedId,
      promoted: '/evidence/current', diagnosis: { methodsStarted: [],
        failures: [{ kind: 'automation-startup', message: 'Timed out while enabling automation mode.' }] } })].join('\n');
}

it('exposes automation startup failure and retains original exit and evidence', () => {
  try { assertFriRunSucceeded({ code: 65, output: output() }); }
  catch (error) {
    expect(error).toMatchObject({ code: 65, invocationId: 'current', evidenceRoot: '/evidence/current' });
    expect(error.message).toContain('automation-startup');
    return;
  }
  throw new Error('Expected the failed batch to stop.');
});

function savedRecovery() {
  const root = path.resolve('.tmp/artifacts/T707-2/tests');
  mkdirSync(root, { recursive: true });
  const dir = mkdtempSync(path.join(root, 'handoff-'));
  const state = path.join(dir, 'recovery.json');
  const log = path.join(dir, 'runner.log');
  return {
    state,
    run(extra = [], text = output()) {
      writeFileSync(log, text);
      const result = spawnSync(process.execPath, ['scripts/ios/fri-run-result.mjs',
        '--state', state, ...extra.map(String)], { encoding: 'utf8' });
      expect(result.status, result.stderr).toBe(0);
      return JSON.parse(result.stdout).handoff;
    },
    log,
    close() { rmSync(dir, { recursive: true, force: true }); }
  };
}

it('continues one saved recovery across processes without discarding user feedback or command evidence', () => {
  const fixture = savedRecovery();
  const diagnosis = { methodsStarted: [], failures: [{ kind: 'automation-startup', message: 'Timeout' }],
    statuses: { xcodeStatus: 65, keepStatus: 0 } };
  const text = [JSON.stringify({ event: 'fri-run-started', invocationId: 'same' }),
    JSON.stringify({ event: 'fri-run-completed', invocationId: 'same', diagnosis })].join('\n');
  const command = ['--log', fixture.log, '--code', 65];
  try {
    const first = fixture.run([...command, '--feedback', JSON.stringify({ prompt: 'handled', app: 'opened' })], text);
    expect(first).toMatchObject({ foreground: 'restored', automation: 'method-not-observed',
      assertions: 'unverified', promptAction: 'do-not-ask', app: 'opened' });
    const reported = fixture.run(['--feedback', JSON.stringify({ app: 'startup-failed', detail: 'Mobile startup failed' })]);
    expect(reported).toMatchObject({ ...first, app: 'startup-failed' });
    const repeated = fixture.run(command, text);
    expect(repeated).toMatchObject({ ...first, app: 'startup-failed' });
    expect(JSON.parse(readFileSync(fixture.state, 'utf8')).feedback)
      .toMatchObject({ prompt: 'handled', app: 'startup-failed', detail: 'Mobile startup failed' });
    expect(fixture.run(['--feedback', JSON.stringify({ prompt: 'pending' })]).promptAction).toBe('await-user');
    expect(fixture.run(['--feedback', JSON.stringify({ prompt: 'handled' })]).promptAction).toBe('do-not-ask');
    expect(fixture.run(command, text + '\npasscodeRequired: true').promptAction).toBe('wait-until-available');
    expect(fixture.run(command, text + '\npasscodeRequired: false').promptAction).toBe('do-not-ask');
  } finally { fixture.close(); }
});

it('refuses unrelated receipts and keeps missing evidence unknown', () => {
  expect(() => assertFriRunSucceeded({ code: 65, output: output('current', 'old') }))
    .toThrow('unknown');
});

it('does not reinterpret an outer interruption as a product failure', () => {
  expect(() => assertFriRunSucceeded({ code: 124, output: output(), terminationReason: 'hard_deadline' }))
    .toThrow('interrupted (hard_deadline); observed=automation-startup');
});

it('preserves successful batch behavior', () => {
  expect(() => assertFriRunSucceeded({ code: 0, output: '' })).not.toThrow();
});

it('reports assertions passed only with current method, passing summary, and no interruption', () => {
  const diagnosis = { methodsStarted: [{ identifier: 'UI/testExample' }], failures: [],
    testResult: 'Passed', statuses: { xcodeStatus: 0, keepStatus: 0 } };
  const text = [JSON.stringify({ event: 'fri-run-started', invocationId: 'pass' }),
    JSON.stringify({ event: 'fri-run-completed', invocationId: 'pass', diagnosis })].join('\n');
  const recovery = {};
  assertFriRunSucceeded({ code: 0, output: text }, 'Fri', { recovery });
  expect(recovery.latest).toMatchObject({ assertions: 'passed', app: 'unverified', foreground: 'restored' });
  try { assertFriRunSucceeded({ code: 124, output: text, signal: 'SIGTERM' }, 'Fri', { recovery }); }
  catch { /* Verify the saved handoff, retaining the interruption. */ }
  expect(recovery.latest).toMatchObject({ assertions: 'unverified', interrupted: 'SIGTERM' });
});

it('retains handled prompts and observed startup failure throughout the same recovery', () => {
  const recovery = {};
  function failure(feedback) {
    try { assertFriRunSucceeded({ code: 65, output: output() }, 'Fri XCTest', { recovery, feedback }); }
    catch (error) { return error; }
    throw new Error('Expected failure');
  }
  const first = failure({ prompt: 'handled', app: 'startup-failed', detail: 'Mobile startup failed' });
  expect(first.handoff).toMatchObject({ promptAction: 'do-not-ask',
    app: 'startup-failed', automation: 'method-not-observed', assertions: 'unverified' });
  expect(failure().handoff).toMatchObject({ promptAction: 'do-not-ask', app: 'startup-failed' });
  expect(recovery.feedback).toMatchObject({ prompt: 'handled', app: 'startup-failed' });
});

it('asks once for an unknown pre-method interruption and accepts new direct prompt evidence', () => {
  const recovery = {};
  const run = (feedback, extra = '') => {
    try { assertFriRunSucceeded({ code: 65, output: output() + extra }, 'Fri', { recovery, feedback }); }
    catch (error) { return error.handoff; }
  };
  expect(run().promptAction).toBe('ask-once-if-prompt-visible');
  expect(run().promptAction).toBe('do-not-ask');
  expect(run({ prompt: 'none' }).promptAction).toBe('do-not-ask');
  expect(run({ prompt: 'pending', detail: 'New trust dialog visible' }).promptAction).toBe('await-user');
  expect(run({ prompt: 'handled' }).promptAction).toBe('do-not-ask');
  expect(run(undefined, '\npasscodeRequired: true').promptAction).toBe('wait-until-available');
  expect(run(undefined, '\npasscodeRequired: false').promptAction).toBe('do-not-ask');
});

it.each([
  ['XCTAssertTrue failed: button absent', 'test-failure', 'failed'],
  ['App crashed during launch', 'app-crash', 'unverified']
])('keeps a post-method failure without inferring a password or a product cause: %s', (message, kind, assertions) => {
  const diagnosis = { methodsStarted: [{ identifier: 'UI/testExample', attempt: 1 }],
    failures: [{ kind, message }], statuses: { xcodeStatus: 65, keepStatus: 0 } };
  const records = output().split('\n');
  records[1] = JSON.stringify({ event: 'fri-run-completed', invocationId: 'current', diagnosis });
  try { assertFriRunSucceeded({ code: 65, output: records.join('\n') }); }
  catch (error) {
    expect(error.handoff).toMatchObject({ automation: 'method-started', foreground: 'restored',
      app: 'unverified', assertions, promptAction: 'do-not-ask' });
    expect(error.handoff.failures[0].message).toBe(message);
    return;
  }
  throw new Error('Expected failed test');
});
