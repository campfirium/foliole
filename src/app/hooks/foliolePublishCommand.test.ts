import { beforeEach, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  loadFoliolePublishSettingsFromRuntime: vi.fn(),
  publishTopicToFoliole: vi.fn()
}));
const showNotice = vi.hoisted(() => vi.fn());
const ensureDocument = vi.hoisted(() => vi.fn());

vi.mock('../../shared/platform/foliolePublishRepository', () => ({
  isFoliolePublishConfigured: (settings: { has_credentials?: boolean } | null) => Boolean(settings?.has_credentials),
  ...repository
}));
vi.mock('../../shared/ui/AppRuntimeNotice', () => ({ showAppRuntimeNotice: showNotice }));
vi.mock('../../store/workspaceNodePreparation', () => ({ ensureWorkspaceNodeDocumentReady: ensureDocument }));

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
  repository.publishTopicToFoliole.mockResolvedValue({ local_path: '/Publish/Site/index.html', url: 'https://site.example/cards/1.html' });
  ensureDocument.mockResolvedValue({ content: 'Saved content' });
});

it('flushes the current Topic, publishes its saved content, and reports success', async () => {
  const { command, runtime } = subject();

  await expect(command()).resolves.toBe(true);
  expect(runtime.flushPendingEditorDraftImmediately).toHaveBeenCalledOnce();
  expect(repository.publishTopicToFoliole).toHaveBeenCalledWith({ content: 'Saved content', node_id: 'topic-1', title: 'Card' });
  expect(showNotice).toHaveBeenCalledWith('Published.');
});

it('opens Publish settings instead of attempting a publish when no site is deployed', async () => {
  repository.loadFoliolePublishSettingsFromRuntime.mockResolvedValue({ has_credentials: false });
  const { command, runtime } = subject();

  await expect(command()).resolves.toBe(false);
  expect(repository.publishTopicToFoliole).not.toHaveBeenCalled();
  expect(runtime.setRequestedSettingsCategory).toHaveBeenCalledWith('publishing');
  expect(runtime.setIsSettingsOpen).toHaveBeenCalledWith(true);
});
