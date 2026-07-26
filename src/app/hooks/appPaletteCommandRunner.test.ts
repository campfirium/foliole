import { describe, expect, it, vi } from 'vitest';

import { APP_COMMAND_IDS } from '../../shared/commands/ids';

import { createPaletteCommandRunner } from './appPaletteCommandRunner';

type RunnerArgs = Parameters<typeof createPaletteCommandRunner>[0];

function createRunner(overrides: Partial<Parameters<typeof createPaletteCommandRunner>[0]> = {}) {
  const args = {
    paletteItems: [],
    recordRecentCommand: vi.fn(),
    redoWorkspaceAction: vi.fn(() => false),
    setCommandPaletteOpen: vi.fn(),
    undoWorkspaceAction: vi.fn(() => false),
    ...overrides
  } as RunnerArgs;
  return { args, run: createPaletteCommandRunner(args) };
}

describe('createPaletteCommandRunner', () => {
  it('runs the contextual source update command outside the command palette catalog', () => {
    const reviewSourceUpdate = vi.fn();
    const { args, run } = createRunner({ reviewSourceUpdate });

    run(APP_COMMAND_IDS.reviewSourceUpdate);

    expect(reviewSourceUpdate).toHaveBeenCalledTimes(1);
    expect(args.recordRecentCommand).toHaveBeenCalledWith(APP_COMMAND_IDS.reviewSourceUpdate);
  });

  it('reruns app undo against fresh workspace state even when the palette item snapshot is disabled', () => {
    const undoWorkspaceAction = vi.fn(() => true);
    const { args, run } = createRunner({
      paletteItems: [{ enabled: false, id: APP_COMMAND_IDS.undo, title: 'Undo' }],
      undoWorkspaceAction
    });

    run(APP_COMMAND_IDS.undo);

    expect(undoWorkspaceAction).toHaveBeenCalledTimes(1);
    expect(args.recordRecentCommand).toHaveBeenCalledWith(APP_COMMAND_IDS.undo);
  });
});
