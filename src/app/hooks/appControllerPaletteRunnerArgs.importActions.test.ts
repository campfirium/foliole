import { expect, it, vi } from 'vitest';

const { requestFileImport, exportCurrentArticleMirror } = vi.hoisted(() => ({
  exportCurrentArticleMirror: vi.fn(),
  requestFileImport: vi.fn()
}));

vi.mock('../components/importActivityRequests', () => ({
  requestClipboardImport: vi.fn(),
  requestFileImport
}));

vi.mock('../../shared/platform/articleMirrorExport', () => ({ exportCurrentArticleMirror }));
vi.mock('../../shared/platform/devReimportSelectedTopic', () => ({ devReimportSelectedTopic: vi.fn() }));

import { devReimportSelectedTopic } from '../../shared/platform/devReimportSelectedTopic';

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
      navigation: { onSelectNodeInVirtualView: vi.fn() },
      nodeList: { onOpenNotesView: vi.fn() },
      review: { onOpenPostponeTopicPanel: vi.fn() },
      virtualView: { onOpenVirtualView: vi.fn() }
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


it('waits for pending editor content to be saved before exporting', async () => {
  exportCurrentArticleMirror.mockReset().mockResolvedValue({ status: 'saved' });
  let finishSave!: (saved: boolean) => void;
  const saved = new Promise<boolean>((resolve) => { finishSave = resolve; });
  const runtime = { isViewingTrashNode: false, flushPendingEditorDraftImmediately: vi.fn(() => saved) };
  const actions = createPaletteRunnerArgs(createRunnerArgs({ runtime, ws: { activeNodeId: 'article', nodeOrder: [], nodesById: {} } }));
  const exporting = actions.exportCurrentArticle();
  expect(exportCurrentArticleMirror).not.toHaveBeenCalled();
  finishSave(true);
  await expect(exporting).resolves.toBe(true);
  expect(exportCurrentArticleMirror).toHaveBeenCalledWith('article');
});

it('does not export when saving editor content fails', async () => {
  exportCurrentArticleMirror.mockReset().mockResolvedValue({ status: 'saved' });
  const runtime = { isViewingTrashNode: false, flushPendingEditorDraftImmediately: vi.fn(async () => false) };
  const actions = createPaletteRunnerArgs(createRunnerArgs({ runtime, ws: { activeNodeId: 'article', nodeOrder: [], nodesById: {} } }));
  await expect(actions.exportCurrentArticle()).resolves.toBe(false);
  expect(exportCurrentArticleMirror).not.toHaveBeenCalled();
});

it('does not replace the selected topic when saving its draft fails', async () => {
  vi.mocked(devReimportSelectedTopic).mockReset().mockResolvedValue({ status: 'failed', detail: 'Source unavailable.' });
  const runtime = { isViewingTrashNode: false, flushPendingEditorDraftImmediately: vi.fn(async () => false) };
  const actions = createPaletteRunnerArgs(createRunnerArgs({ runtime, ws: { activeNodeId: 'article', nodeOrder: [], nodesById: {} } }));

  await expect(actions.reimportSelectedTopic()).resolves.toBe(false);
  expect(devReimportSelectedTopic).not.toHaveBeenCalled();
});

it.each([{ activeNodeId: null, trash: false }, { activeNodeId: 'article', trash: true }])(
  'does not reimport an unavailable selection %s', async ({ activeNodeId, trash }) => {
    vi.mocked(devReimportSelectedTopic).mockClear();
    const flush = vi.fn(async () => true);
    const actions = createPaletteRunnerArgs(createRunnerArgs({
      runtime: { isViewingTrashNode: trash, flushPendingEditorDraftImmediately: flush },
      ws: { activeNodeId, nodeOrder: [], nodesById: {} }
    }));
    await expect(actions.reimportSelectedTopic()).resolves.toBe(false);
    expect(flush).not.toHaveBeenCalled();
    expect(devReimportSelectedTopic).not.toHaveBeenCalled();
  }
);

it('waits for draft saving before reporting an unavailable source', async () => {
  vi.mocked(devReimportSelectedTopic).mockReset().mockResolvedValue({ status: 'unavailable', detail: 'No source.' });
  let finish!: (saved: boolean) => void;
  const saving = new Promise<boolean>(resolve => { finish = resolve; });
  const actions = createPaletteRunnerArgs(createRunnerArgs({
    runtime: { isViewingTrashNode: false, flushPendingEditorDraftImmediately: () => saving },
    ws: { activeNodeId: 'article', nodeOrder: [], nodesById: {} }
  }));
  const running = actions.reimportSelectedTopic();
  expect(devReimportSelectedTopic).not.toHaveBeenCalled();
  finish(true);
  await expect(running).resolves.toBe(false);
  expect(devReimportSelectedTopic).toHaveBeenCalledWith({ nodeId: 'article' });
});
