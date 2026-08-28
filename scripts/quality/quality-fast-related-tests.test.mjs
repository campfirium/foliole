// @vitest-environment node

import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildRelatedTestSteps, runRelatedTests } from './quality-fast-related-tests.mjs';

describe('quality fast related test routing', () => {
  it('keeps ordinary tests on Node and routes registered SQLite tests through Electron', () => {
    const steps = buildRelatedTestSteps([
      'src/companion/useCompanionWorkspaceAutoSync.ios.test.tsx',
      'src/companion/companionCaptureTextActions.ios.test.ts'
    ]);

    expect(steps).toHaveLength(2);
    expect(steps[0].args).toContain('src/companion/useCompanionWorkspaceAutoSync.ios.test.tsx');
    expect(steps[0].args).not.toContain('scripts/electron-sqlite-runner.mjs');
    expect(path.basename(steps[1].args[0])).toBe('electron-sqlite-runner.mjs');
    expect(path.basename(steps[1].args[1])).toBe('run-vitest-with-summary.mjs');
    expect(steps[1].args).toContain('src/companion/companionCaptureTextActions.ios.test.ts');
  });

  it('stops before the next ABI bucket when a related test bucket fails', async () => {
    const calls = [];
    await expect(runRelatedTests([
      'src/companion/plain.test.ts',
      'src/companion/companionTrashActions.ios.test.ts'
    ], async (_command, args) => {
      calls.push(args);
      return 1;
    })).rejects.toThrow('ordinary related tests failed');
    expect(calls).toHaveLength(1);
  });
});
