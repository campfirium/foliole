// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor';
import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { LocalizationProvider } from '../shared/localization/LocalizationProvider';
import type { CompanionContentSaveHandler } from '../shared/platform/companion/editing/companionContentEditContract';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';
import { registerAppConfirmationHandler } from '../shared/ui/appConfirmation';

import { CompanionDraftProvider } from './CompanionDraftProvider';
import { CompanionReadingActivity } from './companionReadingActivity';
import { createCompanionTopicContentSaveHandler } from './companionTopicEditingController';
import { useCompanionContentEditCancel } from './useCompanionContentEditCancel';
import { useCompanionTopicEditAutosave } from './useCompanionTopicEditAutosave';
import { useCompanionWorkspaceLoaders } from './useCompanionWorkspaceLoaders';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return {
    Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
    registerPlugin: createCompanionNativeSyncStub
  };
});
vi.mock('../shared/platform/appLifecycle', () => ({
  subscribeNativeAppForeground: async () => () => {},
  subscribeNativeAppBackground: async () => () => {}
}));

let library: Awaited<ReturnType<typeof createSearchLibrary>> | null = null;
let unregister: (() => void) | null = null;
afterEach(async () => { unregister?.(); unregister = null; await library?.close(); library = null; });

function CancelProbe(props: { content: string; versionId: string; save: CompanionContentSaveHandler }) {
  const [editing, setEditing] = useState(false);
  const draft = useCompanionTopicEditAutosave({ canEdit: true, initialContent: props.content,
    initialVersionId: props.versionId, nodeId: 'topic', onSaveContent: props.save, saveDelayMs: 20 });
  const [activity] = useState(() => new CompanionReadingActivity('topic', () => undefined));
  activity.flushDraft = draft.flushPendingSave;
  activity.editRound = draft.editRound;
  const cancel = useCompanionContentEditCancel(activity, () => { setEditing(false); draft.editRound?.end(); });
  if (!editing) {
    return <><p>{draft.value}</p><button disabled={!draft.ready}
      onClick={() => { setEditing(true); draft.editRound?.begin(); }}>Edit</button></>;
  }
  return <><input aria-label="Body" value={draft.value} onChange={(event) => draft.handleChange(event.target.value)} />
    <button onClick={() => void cancel()}>Cancel</button></>;
}

function ReadingProbe({ initial }: { initial: NativeCompanionWorkspaceSyncState }) {
  const [state, setState] = useState(initial);
  const [, setArticle] = useState<unknown>(null);
  const loaders = useCompanionWorkspaceLoaders({ state, setState, setReadableArticle: setArticle,
    setError: (error) => { if (error) throw new Error(error); } });
  useEffect(() => { void loaders.openReadableArticle('topic'); }, [loaders.openReadableArticle]);
  const save = createCompanionTopicContentSaveHandler({ state,
    refreshAfterMutation: async () => {
      const next = await loadCompanionWorkspaceSyncState();
      setState(next);
      return next.workspace_snapshot;
    }
  } as ReturnType<typeof useCompanionWorkspaceSync>);
  const article = loaders.readableArticle;
  return <LocalizationProvider initialLanguagePreference="en"><CompanionDraftProvider>{article
    ? <CancelProbe content={article.content} versionId={article.currentVersionId!} save={save} />
    : <span>Loading</span>}</CompanionDraftProvider></LocalizationProvider>;
}

it('cancel restores the topic in SQLite after autosaved input and leaves editing', async () => {
  library = await createSearchLibrary(0);
  const baseline = 'Original 中文 body';
  const node = { id: 'topic', content: baseline, kind: 'topic' as const, title: 'Topic',
    isTitleManual: true, hideTitleHeading: false, parentNodeId: null, reveal: null, anchorLink: null,
    reading: null, review: null, createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z' };
  const record = await toWorkspaceNativeNodeVersion(node, 'remote', 'base');
  await writeIosCompanionDatabase((db) => applySyncNodesWithDbPort(db, [record], { enqueueSearchInvalidations: false }));
  const prompts: string[] = [];
  unregister = registerAppConfirmationHandler(async (options) => { prompts.push(options.title); return true; });
  const stored = () => library!.database.prepare('SELECT content FROM nodes WHERE id=?').get('topic');
  const view = render(<ReadingProbe initial={await loadCompanionWorkspaceSyncState()} />);
  const edit = await screen.findByRole('button', { name: 'Edit' });
  await waitFor(() => expect(edit).toBeEnabled());
  fireEvent.click(edit);
  const input = screen.getByRole('textbox', { name: 'Body' });
  fireEvent.change(input, { target: { value: baseline + ' first' } });
  await waitFor(() => expect(stored()).toEqual({ content: baseline + ' first' }));
  fireEvent.change(input, { target: { value: baseline + ' first continued' } });
  await waitFor(() => expect(stored()).toEqual({ content: baseline + ' first continued' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await screen.findByRole('button', { name: 'Edit' });
  expect(prompts).toEqual(['Discard changes?']);
  expect(stored()).toEqual({ content: baseline });
  expect(screen.getByText(baseline)).toBeInTheDocument();
  view.unmount();
});
