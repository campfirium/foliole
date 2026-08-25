// @vitest-environment node

import { expect, it, vi } from 'vitest';

import {
  cancelAdmissionSibling, createDiagnosticStageActions, windowsJoinFailure
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
  cancelAdmissionSibling(approvalController, 'windows-c-join', 'rejected');
  expect(approvalController.abort).toHaveBeenCalledOnce();
});

it('keeps the public Android runtime when Windows join succeeds', () => {
  const approvalController = { abort: vi.fn() };
  cancelAdmissionSibling(approvalController, 'windows-c-join', 'fulfilled');
  expect(approvalController.abort).not.toHaveBeenCalled();
});

it('preserves the fixed Windows native startup failure attribution', () => {
  expect(windowsJoinFailure({ code: 125, stderr:
    '[windows-dev-action] failure stage=entry message=native client interactive task did not start within 5 seconds\n'
  })).toMatchObject({
    failureAxis: 'execution', executionOwner: 'controller', host: 'windows-c',
    missingFact: 'windows_native_interactive_start_failed'
  });
});
