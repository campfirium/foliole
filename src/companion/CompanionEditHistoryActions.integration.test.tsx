// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor';
import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';
import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { LocalizationProvider } from '../shared/localization/LocalizationProvider';
import { readCompanionContentSource, saveCompanionContentEdit } from '../shared/platform/companion/editing/companionContentEditing';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { CompanionDraftProvider } from './CompanionDraftProvider';
import { CompanionEditHistoryActions } from './CompanionEditHistoryActions';
import { ReadableArticleDocument } from './CompanionReadableArticleDocument';
import { CompanionReadingActivity } from './companionReadingActivity';
import { ReadingChrome } from './CompanionReadingChrome';
import { ReadingActionsSheet } from './CompanionReadingSheets';
import { DEFAULT_READING_TYPOGRAPHY_SETTINGS } from './companionReadingTypographySettings';
import { createCompanionTopicContentSaveHandler } from './companionTopicEditingController';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';


vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});
vi.mock('../shared/platform/appLifecycle', () => ({
  subscribeNativeAppForeground: async () => () => {}, subscribeNativeAppBackground: async () => () => {},
  subscribeNativeAppEnteredBackground: async () => () => {}
}));

let library: Awaited<ReturnType<typeof createSearchLibrary>>;
let editor: EditorAdapter | null = null;
beforeEach(async () => {
  library = await createSearchLibrary(0);
  const record = await toWorkspaceNativeNodeVersion({ id: 'topic', content: 'Original body', kind: 'topic', title: 'Topic',
    isTitleManual: true, hideTitleHeading: false, parentNodeId: null, reveal: null, anchorLink: null,
    reading: null, review: null, createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z' }, 'remote', 'base');
  await writeIosCompanionDatabase(db => applySyncNodesWithDbPort(db, [record], { enqueueSearchInvalidations: false }));
});
afterEach(async () => { editor = null; await library.close(); });

function Reader() {
  const [source, setSource] = useState({ content: 'Original body', currentVersionId: 'base' });
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
    <ReadingChrome isContentEditing title="Topic" onExit={() => {}} onOpenActions={() => setOpen(true)} onOpenOutline={() => {}} />
    <ReadableArticleDocument allowContentEditing activity={activity} onSaveContent={save} onEditorReady={value => { editor = value; }}
      readableArticle={{ ...source, nodeId: 'topic', title: 'Topic', hideTitleHeading: false,
        textAnchorDecorations: [], pdfAttachmentId: null, persistedNodeViewState: null }}
      readingTypographySettings={DEFAULT_READING_TYPOGRAPHY_SETTINGS} />
    <ReadingActionsSheet open={open} onOpenChange={setOpen} onFindInDocument={() => {}} onOpenReadingSheet={() => {}}
      editHistory={{ documentId: 'topic', flush: () => activity.flush(), refresh,
        adopt: async (id, version) => { await activity.refreshDraft?.(id, version); } }} />
  </>;
}

it('undoes buffered real editor input from the editing overflow and redoes it in SQLite and the editor', async () => {
  render(<LocalizationProvider initialLanguagePreference="en"><MouseGestureSettingsProvider><CompanionDraftProvider>
    <Reader />
  </CompanionDraftProvider></MouseGestureSettingsProvider></LocalizationProvider>);
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Topic body' })).toHaveAttribute('contenteditable', 'true'));
  act(() => editor!.replaceRange(0, 0, 'Typed '));
  // jsdom cannot evaluate this CodeMirror visual rule under Radix's colon-containing IDs.
  for (const sheet of document.styleSheets) {
    Array.from(sheet.cssRules).forEach((rule, index) => {
      if (rule.cssText.includes(':has(')) sheet.deleteRule(index);
    });
  }
  fireEvent.click(screen.getByRole('button', { name: 'More reading actions' }), { detail: 1 });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Undo Edit Text' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Undo Edit Text' }));
  await waitFor(() => expect(editor!.getContent()).toBe('Original body'));
  expect(library.database.prepare("SELECT content FROM nodes WHERE id='topic'").get()).toEqual({ content: 'Original body' });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Redo Edit Text' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Redo Edit Text' }));
  await waitFor(() => expect(editor!.getContent()).toBe('Typed Original body'));
  expect(library.database.prepare("SELECT content FROM nodes WHERE id='topic'").get()).toEqual({ content: 'Typed Original body' });
});

it('retries a failed refresh without undoing a second edit', async () => {
  for (const content of ['First', 'Second']) {
    const source = await readCompanionContentSource('topic');
    await saveCompanionContentEdit({ nodeId: 'topic', content, baseVersionId: source.versionId,
      baseContent: source.content, versionId: crypto.randomUUID(), updatedAt: new Date().toISOString() });
  }
  const refresh = vi.fn().mockRejectedValueOnce(new Error('refresh failed')).mockResolvedValue(undefined);
  render(<LocalizationProvider initialLanguagePreference="en"><CompanionEditHistoryActions documentId="topic" open refresh={refresh} /></LocalizationProvider>);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Undo Edit Text' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Undo Edit Text' }));
  await screen.findByRole('alert');
  expect((await readCompanionContentSource('topic')).content).toBe('First');
  fireEvent.click(screen.getAllByRole('button', { name: 'Refresh' })[0]!);
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
  expect((await readCompanionContentSource('topic')).content).toBe('First');
});
