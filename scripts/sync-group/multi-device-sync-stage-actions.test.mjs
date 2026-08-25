// @vitest-environment node

import { expect, it, vi } from 'vitest';

import {
  cancelAdmissionSibling, createDiagnosticStageActions, syncAdmittedCToAndroid, windowsJoinFailure
} from './multi-device-sync-stage-actions.mjs';

/* global process */

it('binds the A-leave product stage to its real cross-host action', () => {
  const actions = createDiagnosticStageActions({
    repoRoot: process.cwd(), requiredHosts: ['macos-a', 'android-b', 'windows-c'], runId: 'run-1'
  });
  expect(actions['admit-c']).toBeTypeOf('function');
  expect(actions['leave-a']).toBeTypeOf('function');
  expect(actions['set-participation']).toBeTypeOf('function');
  expect(actions['prove-sync-from-zero']).toBeTypeOf('function');
});

it('cancels Android immediately when Windows join fails before approval', () => {
  const approvalController = { abort: vi.fn() };
  const approvalRelease = { release: vi.fn() };
  cancelAdmissionSibling(approvalController, approvalRelease, 'windows-c-join', 'rejected');
  expect(approvalController.abort).toHaveBeenCalledOnce();
  expect(approvalRelease.release).not.toHaveBeenCalled();
});

it('releases approval after Windows becomes an available member', () => {
  const approvalController = { abort: vi.fn() };
  const approvalRelease = { release: vi.fn(() => Promise.resolve()) };
  cancelAdmissionSibling(approvalController, approvalRelease, 'windows-c-join', 'fulfilled');
  expect(approvalController.abort).not.toHaveBeenCalled();
  expect(approvalRelease.release).toHaveBeenCalledOnce();
});

it('uses public Android Sync Now to consume the admitted C fact', async () => {
  const events = [];
  const runSyncNow = vi.fn(async (options) => {
    events.push('sync-now');
    return options.observeWhileTransportOpen();
  });
  const restartAndroid = vi.fn(async () => events.push('restart'));
  const waitForFact = vi.fn(async () => {
    events.push('fact');
    return 'observed-c';
  });
  await expect(syncAdmittedCToAndroid({ env: {}, evidenceRoot: '/evidence', execute: vi.fn(),
    factId: 'fact-c', paths: {}, restartAndroid, runId: 'run-1', runSyncNow, waitForFact
  })).resolves.toEqual({ restarted: 'observed-c', sync: 'observed-c' });
  expect(runSyncNow).toHaveBeenCalledWith(expect.objectContaining({
    action: 'sync-now', buildIdentity: 'run-1', installMain: false
  }));
  expect(restartAndroid).toHaveBeenCalledWith({ env: {}, execute: expect.any(Function), paths: {} });
  expect(waitForFact).toHaveBeenCalledTimes(2);
  expect(waitForFact).toHaveBeenNthCalledWith(1, {}, 'fact-c', 'C');
  expect(waitForFact).toHaveBeenNthCalledWith(2, {}, 'fact-c', 'C');
  expect(events).toEqual(['sync-now', 'fact', 'restart', 'fact']);
});

it('preserves the fixed Windows native startup failure attribution', () => {
  expect(windowsJoinFailure({ code: 125, stderr:
    '[windows-dev-action] failure stage=entry message=native client interactive task did not start within 5 seconds\n'
  })).toMatchObject({
    failureAxis: 'execution', executionOwner: 'controller', host: 'windows-c',
    missingFact: 'windows_native_interactive_start_failed'
  });
});
