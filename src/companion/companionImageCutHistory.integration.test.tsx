// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor';
import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { LocalizationProvider } from '../shared/localization/LocalizationProvider';
import { readCompanionContentSource } from '../shared/platform/companion/editing/companionContentEditing';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { CompanionDraftProvider } from './CompanionDraftProvider';
import { CompanionEditHistoryActions } from './CompanionEditHistoryActions';
import { ReadableArticleDocument } from './CompanionReadableArticleDocument';
import { CompanionReadingActivity } from './companionReadingActivity';
import { DEFAULT_READING_TYPOGRAPHY_SETTINGS } from './companionReadingTypographySettings';
import { createCompanionTopicContentSaveHandler } from './companionTopicEditingController';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

const clipboard = vi.hoisted(() => ({ writeClipboardText: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../shared/platform/companion/runtime/textClipboard', () => clipboard);
vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: createCompanionNativeSyncStub };
});
vi.mock('../shared/platform/appLifecycle', () => ({
  subscribeNativeAppForeground: async () => () => {}, subscribeNativeAppBackground: async () => () => {},
  subscribeNativeAppEnteredBackground: async () => () => {}
}));

const image = `![Diagram](asset://${'a'.repeat(64)}.png)`;
const original = `Before\n\n${image}\n\nAfter`;
const removed = 'Before\n\n\n\nAfter';
let library: Awaited<ReturnType<typeof createSearchLibrary>> | undefined;
Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
afterEach(async () => { cleanup(); await library?.close(); library = undefined; });

function Reader() {
  const [source, setSource] = useState({ content: original, currentVersionId: 'base' });
  const [open, setOpen] = useState(false);
  const [activity] = useState(() => new CompanionReadingActivity('topic', () => {}));
  const refresh = async () => {
    const value = await readCompanionContentSource('topic');
    setSource({ content: value.content, currentVersionId: value.versionId });
    return (await loadCompanionWorkspaceSyncState()).workspace_snapshot;
  };
  const save = createCompanionTopicContentSaveHandler({ state: { workspace_snapshot: null },
    refreshAfterMutation: refresh } as ReturnType<typeof useCompanionWorkspaceSync>);
  return <>
    <ReadableArticleDocument allowContentEditing activity={activity} onSaveContent={save}
      readableArticle={{ ...source, nodeId: 'topic', title: 'Topic', hideTitleHeading: false,
        textAnchorDecorations: [], pdfAttachmentId: null, persistedNodeViewState: null }}
      readingTypographySettings={DEFAULT_READING_TYPOGRAPHY_SETTINGS} />
    <button onClick={() => setOpen(true)}>History</button>
    <CompanionEditHistoryActions open={open} documentId="topic" flush={() => activity.flush()} refresh={refresh}
      adopt={async (id, version) => { await activity.refreshDraft?.(id, version); }} />
  </>;
}

it('cuts through the real autosaving editor and restores or reapplies the image through persisted Undo and Redo', async () => {
  library = await createSearchLibrary(0);
  const record = await toWorkspaceNativeNodeVersion({ id: 'topic', content: original, kind: 'topic', title: 'Topic',
    isTitleManual: true, hideTitleHeading: false, parentNodeId: null, reveal: null, anchorLink: null,
    reading: null, review: null, createdAt: '2026-11-17T00:00:00Z', updatedAt: '2026-11-17T00:00:00Z' }, 'remote', 'base');
  await writeIosCompanionDatabase(db => applySyncNodesWithDbPort(db, [record], { enqueueSearchInvalidations: false }));
  const view = render(<LocalizationProvider initialLanguagePreference="en"><MouseGestureSettingsProvider>
    <CompanionDraftProvider><Reader /></CompanionDraftProvider>
  </MouseGestureSettingsProvider></LocalizationProvider>);
  await waitFor(() => expect(view.container.querySelector('.cm-content')).toHaveAttribute('contenteditable', 'true'));
  fireEvent.contextMenu(view.container.querySelector('.cm-md-image-widget')!);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Cut image' }));
  await waitFor(() => expect(library!.database.prepare("SELECT content FROM nodes WHERE id='topic'").pluck().get()).toBe(removed), { timeout: 5000 });
  fireEvent.click(screen.getByRole('button', { name: 'History' }));
  const undo = await screen.findByRole('button', { name: 'Undo Edit Text' });
  await waitFor(() => expect(undo).toBeEnabled());
  fireEvent.click(undo);
  await waitFor(() => expect(library!.database.prepare("SELECT content FROM nodes WHERE id='topic'").pluck().get()).toBe(original));
  await waitFor(() => expect(view.container.querySelector('.cm-md-image-widget')).not.toBeNull());
  const redo = await screen.findByRole('button', { name: 'Redo Edit Text' });
  await waitFor(() => expect(redo).toBeEnabled());
  fireEvent.click(redo);
  await waitFor(() => expect(library!.database.prepare("SELECT content FROM nodes WHERE id='topic'").pluck().get()).toBe(removed));
  await act(async () => { expect((await readCompanionContentSource('topic')).content).toBe(removed); });
  expect(view.container.querySelector('.cm-md-image-widget')).toBeNull();
});
