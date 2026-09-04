import { afterEach, describe, expect, it, vi } from 'vitest';

import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { installDemoRuntimeController } from '../../shared/platform/runtime/demoRuntime';

const demoNoticeMocks = vi.hoisted(() => ({ showDemoOperationNotice: vi.fn() }));
vi.mock('../../shared/ui/DemoOperationNotice', () => demoNoticeMocks);

import { createPaletteCommandRunner } from './appPaletteCommandRunner';

type RunnerArgs = Parameters<typeof createPaletteCommandRunner>[0];

function installDemoRuntime(isDemo: boolean) {
  const state = {
    clearError: null, importError: null, importedTopicCount: 0,
    isDemo, manualAdvanceDays: 0, previewDay: 0, startedAt: null
  };
  installDemoRuntimeController({
    clearLocalData: () => Promise.resolve(false),
    continueToNextPreviewDay: () => undefined,
    getNowIso: (date) => date.toISOString(),
    getState: () => state,
    importMarkdown: () => Promise.resolve({ ignoredCount: 0, importedTopicCount: 0 }),
    subscribe: () => () => undefined
  });
}

afterEach(() => {
  installDemoRuntime(false);
  demoNoticeMocks.showDemoOperationNotice.mockReset();
});

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
  it('keeps non-demonstrable Demo commands visible but intercepts their execution', () => {
    installDemoRuntime(true);
    const openLocalFile = vi.fn();
    const demoOperationTranslate = vi.fn((key: string) => key);
    const { args, run } = createRunner({
      demoOperationTranslate,
      openLocalFile,
      paletteItems: [{ enabled: true, id: APP_COMMAND_IDS.openLocalFile, title: 'Open File' }]
    });

    run(APP_COMMAND_IDS.openLocalFile);

    expect(openLocalFile).not.toHaveBeenCalled();
    expect(demoNoticeMocks.showDemoOperationNotice).toHaveBeenCalledWith(demoOperationTranslate);
    expect(args.setCommandPaletteOpen).toHaveBeenCalledWith(false);
  });

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

  it('rechecks document scrolling at execution time when the palette snapshot is stale', () => {
    const scrollDocumentBottom = vi.fn(() => true);
    const { args, run } = createRunner({
      paletteItems: [{ enabled: false, id: APP_COMMAND_IDS.scrollDocumentBottom, title: 'Scroll down' }],
      scrollDocumentBottom
    });

    run(APP_COMMAND_IDS.scrollDocumentBottom);

    expect(scrollDocumentBottom).toHaveBeenCalledTimes(1);
    expect(args.recordRecentCommand).toHaveBeenCalledWith(APP_COMMAND_IDS.scrollDocumentBottom);
  });
});
