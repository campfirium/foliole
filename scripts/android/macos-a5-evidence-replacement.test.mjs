// @vitest-environment node

import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  formalEvidenceRetentionTaskId, replaceSupersededFormalEvidence,
  writeFormalEvidenceRetentionOwner
} from './macos-a5-evidence-replacement.mjs';

const ACTION = 'single-principal-sync-group';
const IDS = [
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333'
];
const CONTRACT = { action: ACTION,
  formalEvidence: { kind: 'run-directory', root: 'a5-single-principal-sync-group' },
  formalEvidenceRetention: 'latest-terminal-per-task', formalTarget: 'fixed-a5',
  formalTargetIdentity: '87a33a4b' };

function fixture(run) {
  const root = mkdtempSync(path.join(tmpdir(), 'a5-evidence-replacement-'));
  const artifactsRoot = path.join(root, '.tmp', 'artifacts');
  const context = { artifactsRoot,
    controllerStateRoot: path.join(root, '.lab', 'internal', 'macos-a5-controller') };
  mkdirSync(artifactsRoot, { recursive: true });
  try { return run({ context, root }); }
  finally { rmSync(root, { force: true, recursive: true }); }
}

function addRun({ context }, runId, {
  action = ACTION, completedAt = runId, evidence = true, owner = {}, receipt = {}, taskId = 't179-1'
} = {}) {
  const receiptDir = path.join(context.artifactsRoot, 'macos-a5-formal', runId);
  const evidenceDir = path.join(context.artifactsRoot, 'a5-single-principal-sync-group', runId);
  mkdirSync(receiptDir, { recursive: true });
  if (evidence) {
    mkdirSync(evidenceDir, { recursive: true });
    writeFileSync(path.join(evidenceDir, 'payload'), runId);
  }
  writeFileSync(path.join(receiptDir, 'formal-run-receipt.json'), JSON.stringify({
    action, completedAt, resultStatus: 'complete', runId,
    target: { identity: '87a33a4b', kind: 'fixed-a5' }, ...receipt
  }));
  if (owner !== null) writeFileSync(path.join(receiptDir, 'retention-owner.json'), JSON.stringify({
    action, runId, schemaVersion: 1, taskId,
    target: { identity: '87a33a4b', kind: 'fixed-a5' }, ...owner
  }));
  return { evidenceDir, receiptDir };
}

function replace(context, currentRunId = null, options = {}) {
  return replaceSupersededFormalEvidence({
    actionContract: CONTRACT, checkPid: () => false, context, currentRunId,
    taskId: 't179-1', ...options
  });
}

describe('formal A5 evidence replacement', () => {
  it('requires a bounded task identity only for the opted-in formal action', () => {
    expect(formalEvidenceRetentionTaskId(CONTRACT, {
      env: { FOLIOLE_ACCEPTANCE_TASK_ID: 't179-1' }, formal: true
    })).toBe('t179-1');
    for (const taskId of ['', 'T179-1', '-t179', 'a'.repeat(65), 't179/1']) {
      expect(() => formalEvidenceRetentionTaskId(CONTRACT, {
        env: { FOLIOLE_ACCEPTANCE_TASK_ID: taskId }, formal: true
      })).toThrow('FOLIOLE_ACCEPTANCE_TASK_ID');
    }
    expect(formalEvidenceRetentionTaskId(CONTRACT, { env: {}, formal: false })).toBeNull();
  });

  it.each([['complete', 'complete'], ['failed', 'failed'], ['complete', 'failed'],
    ['failed', 'complete']])(
    'keeps only the latest whole result across %s then %s', (firstStatus, latestStatus) =>
      fixture(({ context }) => {
        const first = addRun({ context }, IDS[0], { receipt: { resultStatus: firstStatus } });
        const latest = addRun({ context }, IDS[1], { receipt: { resultStatus: latestStatus } });

        expect(replace(context, IDS[1])).toMatchObject({ deletedCount: 1, failures: [] });
        expect(existsSync(first.evidenceDir)).toBe(false);
        expect(existsSync(first.receiptDir)).toBe(false);
        expect(existsSync(latest.evidenceDir)).toBe(true);
        expect(existsSync(latest.receiptDir)).toBe(true);
      })
  );

  it('keeps the previous result when the new failure has no evidence directory', () =>
    fixture(({ context }) => {
      const previous = addRun({ context }, IDS[0]);
      const failed = addRun({ context }, IDS[1], {
        evidence: false, receipt: { resultStatus: 'failed' }
      });

      expect(replace(context, IDS[1])).toMatchObject({ deletedCount: 0, failures: [] });
      expect(existsSync(previous.evidenceDir)).toBe(true);
      expect(existsSync(previous.receiptDir)).toBe(true);
      expect(existsSync(failed.receiptDir)).toBe(true);
    }));

  it('ignores unrelated, pending, active, corrupt, symlinked, and escaped candidates', () =>
    fixture(({ context, root }) => {
      const keeper = addRun({ context }, IDS[2]);
      const differentTask = addRun({ context }, IDS[0], { taskId: 't173-2' });
      const pending = addRun({ context }, IDS[1], { receipt: { resultStatus: 'pending' } });
      const activeId = '44444444-4444-4444-4444-444444444444';
      const active = addRun({ context }, activeId);
      const activeRoot = path.join(context.controllerStateRoot, 'runs', activeId);
      mkdirSync(activeRoot, { recursive: true });
      writeFileSync(path.join(activeRoot, 'owner.json'), JSON.stringify({ pid: 1, runId: activeId }));
      const corruptId = '55555555-5555-5555-5555-555555555555';
      const corrupt = addRun({ context }, corruptId);
      writeFileSync(path.join(corrupt.receiptDir, 'retention-owner.json'), '{');
      const linkedId = '66666666-6666-6666-6666-666666666666';
      const linked = addRun({ context }, linkedId, { evidence: false });
      const outside = path.join(root, 'outside');
      mkdirSync(outside);
      symlinkSync(outside, linked.evidenceDir);
      const otherAction = addRun({ context }, '77777777-7777-7777-7777-777777777777', {
        action: 'capture-annotation'
      });
      const otherTarget = addRun({ context }, '88888888-8888-8888-8888-888888888888', {
        owner: { target: { identity: 'other-a5', kind: 'fixed-a5' } },
        receipt: { target: { identity: 'other-a5', kind: 'fixed-a5' } }
      });
      const corruptReceipt = addRun({ context }, '99999999-9999-9999-9999-999999999999');
      writeFileSync(path.join(corruptReceipt.receiptDir, 'formal-run-receipt.json'), '{');

      const result = replaceSupersededFormalEvidence({ actionContract: CONTRACT,
        checkPid: () => true, context, currentRunId: IDS[2], taskId: 't179-1' });

      expect(result).toMatchObject({ deletedCount: 0, failures: [] });
      for (const item of [keeper, differentTask, pending, active, corrupt, linked,
        otherAction, otherTarget, corruptReceipt]) {
        expect(existsSync(item.receiptDir)).toBe(true);
      }
      const escaped = replaceSupersededFormalEvidence({
        actionContract: { ...CONTRACT, formalEvidence: { kind: 'run-directory', root: '../outside' } },
        checkPid: () => false, context, currentRunId: IDS[2], taskId: 't179-1'
      });
      expect(escaped.deletedCount).toBe(0);
    }));

  it('reconciles duplicates before a new pending run and drops a superseded dangling receipt', () =>
    fixture(({ context }) => {
      const oldest = addRun({ context }, IDS[0], { completedAt: '2026-09-08T01:00:00.000Z' });
      const latest = addRun({ context }, IDS[1], { completedAt: '2026-09-08T02:00:00.000Z' });
      const dangling = addRun({ context }, IDS[2], {
        completedAt: '2026-09-08T03:00:00.000Z', evidence: false
      });

      expect(replace(context)).toMatchObject({ deletedCount: 2, failures: [] });
      expect(existsSync(oldest.receiptDir)).toBe(false);
      expect(existsSync(dangling.receiptDir)).toBe(false);
      expect(existsSync(latest.evidenceDir)).toBe(true);
    }));

  it('removes evidence before its receipt and retries an interrupted dangling receipt', () =>
    fixture(({ context }) => {
      const old = addRun({ context }, IDS[0]);
      addRun({ context }, IDS[1]);
      const calls = [];
      const interrupted = replace(context, IDS[1], { removeEntry: (pathname) => {
        calls.push(pathname);
        if (pathname === old.receiptDir) throw new Error('interrupted');
        rmSync(pathname, { force: true, recursive: true });
      } });

      expect(calls.map((pathname) => [path.basename(path.dirname(pathname)), path.basename(pathname)]))
        .toEqual([
          ['a5-single-principal-sync-group', IDS[0]],
          ['macos-a5-formal', IDS[0]]
      ]);
      expect(interrupted.failures).toHaveLength(1);
      expect(existsSync(old.evidenceDir)).toBe(false);
      expect(existsSync(old.receiptDir)).toBe(true);
      expect(replace(context, IDS[1])).toMatchObject({ deletedCount: 1, failures: [] });
      expect(existsSync(old.receiptDir)).toBe(false);
    }));

  it('writes task ownership beside the existing receipt without changing it', () => fixture(({ context }) => {
    const run = addRun({ context }, IDS[0], { owner: null });
    const receiptPath = path.join(run.receiptDir, 'formal-run-receipt.json');
    const before = readFileSync(receiptPath, 'utf8');
    writeFormalEvidenceRetentionOwner({ path: receiptPath,
      receipt: { action: ACTION, runId: IDS[0], target: {
        identity: '87a33a4b', kind: 'fixed-a5'
      } } }, 't179-1');
    expect(readFileSync(receiptPath, 'utf8')).toBe(before);
    expect(JSON.parse(readFileSync(path.join(run.receiptDir, 'retention-owner.json'), 'utf8')))
      .toMatchObject({ runId: IDS[0], taskId: 't179-1' });
  }));
});
