// @vitest-environment node

import { expect, it } from 'vitest';

import { createDiagnosticStageActions } from './multi-device-sync-stage-actions.mjs';

/* global process */

it('binds the A-leave product stage to its real cross-host action', () => {
  const actions = createDiagnosticStageActions({
    repoRoot: process.cwd(), requiredHosts: ['macos-a', 'android-b', 'windows-c'], runId: 'run-1'
  });
  expect(actions['leave-a']).toBeTypeOf('function');
});
