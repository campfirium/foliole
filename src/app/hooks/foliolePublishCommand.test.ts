import { beforeEach, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  loadFoliolePublishSettingsFromRuntime: vi.fn()
}));
const ensureDocument = vi.hoisted(() => vi.fn());
const requestDialog = vi.hoisted(() => vi.fn());

vi.mock('../../shared/platform/foliolePublishRepository', () => ({
  ...repository
}));
vi.mock('../../store/workspaceNodePreparation', () => ({ ensureWorkspaceNodeDocumentReady: ensureDocument }));
vi.mock('../components/foliolePublishDialogRequest', () => ({ requestFoliolePublishDialog: requestDialog }));

import { createPublishToFolioleCommand } from './foliolePublishCommand';

function subject() {
  const runtime = {
    flushPendingEditorDraftImmediately: vi.fn().mockResolvedValue(true),
    setIsSettingsOpen: vi.fn(), setRequestedSettingsCategory: vi.fn(), setRequestedSettingsDialog: vi.fn()
  };
  const ws = {
    activeNodeId: 'topic-1',
    nodesById: { 'topic-1': { anchorLink: null, content: 'Draft', kind: 'topic', title: 'Card' } }
  };
  return { command: createPublishToFolioleCommand({ runtime, ws } as never), runtime };
}

beforeEach(() => {
  vi.clearAllMocks();
  repository.loadFoliolePublishSettingsFromRuntime.mockResolvedValue({ has_credentials: true });
  ensureDocument.mockResolvedValue({ content: 'Saved content' });
});

it('flushes the current Topic and opens the publish panel with its saved content', async () => {
  const { command, runtime } = subject();

  await expect(command()).resolves.toBe(true);
  expect(runtime.flushPendingEditorDraftImmediately).toHaveBeenCalledOnce();
  expect(requestDialog).toHaveBeenCalledWith({ content: 'Saved content', nodeId: 'topic-1', settings: { has_credentials: true }, title: 'Card' });
});

it('opens the panel without hosting so Preview remains available', async () => {
  repository.loadFoliolePublishSettingsFromRuntime.mockResolvedValue({ has_credentials: false });
  const { command, runtime } = subject();

  await expect(command()).resolves.toBe(true);
  expect(requestDialog).toHaveBeenCalledWith(expect.objectContaining({ settings: { has_credentials: false } }));
  expect(runtime.setIsSettingsOpen).not.toHaveBeenCalled();
});
