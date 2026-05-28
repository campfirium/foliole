import { expect, it, vi } from 'vitest';

const { requestFileImport } = vi.hoisted(() => ({
  requestFileImport: vi.fn()
}));

vi.mock('../components/importActivityRequests', () => ({
  requestClipboardImport: vi.fn(),
  requestFileImport
}));

import { createPaletteRunnerArgs } from './appControllerPaletteRunnerArgs';

function createRunnerArgs(overrides: Record<string, unknown> = {}) {
  return {
    appearance: {},
    formalImport: {
      startImportFile: vi.fn()
    },
    isStudyMode: false,
    layoutProps: {
      document: { onEnterPriorityQuickSet: vi.fn() },
      editorCommands: {
        onCreateClozeFromSelection: vi.fn(),
        onCreateHighlightFromSelection: vi.fn(),
        onOpenSelectionNote: vi.fn()
      },
      layoutChrome: {
        onToggleBothSidebarVisibility: vi.fn(),
        onToggleImmersiveMode: vi.fn(),
        onToggleListVisibility: vi.fn(),
        onToggleRightSidebarVisibility: vi.fn()
      },
      nodeList: { onOpenNotesView: vi.fn() },
      review: { onOpenPostponeTopicPanel: vi.fn() }
    },
    nav: {},
    onOpenHelpSearch: vi.fn(),
    paletteItems: [],
    requestDeleteSourceTopic: vi.fn(),
    runtime: {
      recordRecentCommand: vi.fn(),
      setGoToNodePaletteOpen: vi.fn(),
      setIsCommandPaletteOpen: vi.fn(),
      setIsMoveToNodePaletteOpen: vi.fn(),
      setIsSettingsOpen: vi.fn()
    },
    study: {},
    trash: {
      closeTrashView: vi.fn(),
      isTrashViewOpen: false,
      openTrashView: vi.fn()
    },
    ws: {},
    ...overrides
  } as unknown as Parameters<typeof createPaletteRunnerArgs>[0];
}

it('routes Import Files palette commands through the workspace activity request', () => {
  const startImportFile = vi.fn();
  const runnerArgs = createPaletteRunnerArgs(createRunnerArgs({
    formalImport: { startImportFile }
  }));

  runnerArgs.importSingleFile();

  expect(requestFileImport).toHaveBeenCalledTimes(1);
  expect(startImportFile).not.toHaveBeenCalled();
});
