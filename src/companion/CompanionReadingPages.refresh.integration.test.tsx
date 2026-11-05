import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: () => ({
    ...createCompanionNativeSyncStub(), stopSyncGroupProvider: async () => {}, addListener: async () => ({ remove: async () => {} })
  }) };
});

import { listCompanionOpenVirtualFolders } from '../shared/platform/companion/browse/companionOpenVirtualFolders';
import { refreshCompanionWorkspaceSnapshot } from '../shared/platform/companion/companionWorkspaceSnapshotRefresh';
import { registerCompanionSyncAppliedRefresh } from '../shared/platform/companion/companionWorkspaceSnapshotStore';
import { saveCompanionNavigationResume } from '../shared/platform/companion/runtime/companionNavigationResume';
import { createResumeLibrary } from '../test/companionNavigationResume.testSupport';

import { initialCompanionNavigation } from './companionNavigationState';
import { installReadingRangeGeometry, ReadingLibraryShell } from './companionReadingPages.testSupport';

let restoreRange: () => void;
let library: Awaited<ReturnType<typeof createResumeLibrary>>;
beforeAll(() => { restoreRange = installReadingRangeGeometry(); });
afterAll(() => restoreRange());
beforeEach(async () => { library = await createResumeLibrary(); });
afterEach(async () => { cleanup(); vi.restoreAllMocks(); await library.close(); });

async function start(directory?: string) {
  const snapshot = await library.snapshot();
  await saveCompanionNavigationResume(snapshot.libraryScope!, JSON.stringify({ ...initialCompanionNavigation(true),
    activeAction: 'recent', isBrowseDirectoryOpen: Boolean(directory),
    directorySelection: directory ? { kind: 'virtual', nodeId: directory } : { kind: 'root' }
  }));
  return render(<ReadingLibraryShell snapshot={snapshot} />);
}

async function exitReader() {
  fireEvent.click(await screen.findByTestId('companion-article-document'));
  fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
}

async function publishCommittedFacts(nodeIds: string[]) {
  // Transport is outside this fixture; actual SQLite facts enter the production refresh path.
  registerCompanionSyncAppliedRefresh({ kind: 'nodes', nodeIds });
  await act(async () => { await refreshCompanionWorkspaceSnapshot(); });
}

it('updates changed list facts after reading without replacing a surviving row or its page', async () => {
  library.database.exec(`INSERT INTO nodes (id,parent_id,title,kind,content,created_at,updated_at)
    VALUES ('other','folder','Other','topic','Other body','2026-01-01','2026-01-01')`);
  await start();
  const row = await screen.findByRole('button', { name: 'Open topic Other' });
  const page = row.closest('[data-companion-page]');
  fireEvent.click(screen.getByRole('button', { name: 'Open topic Article' }));
  const body = await screen.findByTestId('companion-article-document');
  const reader = body.closest<HTMLElement>('section.fixed')!;
  reader.scrollTop = 640;
  fireEvent.scroll(reader);
  library.database.exec("UPDATE nodes SET title = 'Updated other', updated_at = '2026-11-03' WHERE id = 'other'");
  await publishCommittedFacts(['other']);
  // Even programmatic movement of the hidden list cannot replace the document position.
  fireEvent.scroll(page!, { target: { scrollTop: 200 } });
  await exitReader();
  expect(await screen.findByRole('button', { name: 'Open topic Updated other' })).toBe(row);
  expect(row.closest('[data-companion-page]')).toBe(page);
  await waitFor(() => expect(library.database.prepare('SELECT scroll_top FROM node_view_state WHERE node_id = ?').pluck().get('article')).toBe(640));
});

it.each(['virtual', 'internal'])('keeps database text membership fresh from a %s folder during reading', async location => {
  const filter = JSON.stringify({ version: 1, match: 'all', conditions: [{ field: 'text', operator: 'contains', value: 'needle' }] });
  library.database.exec(`INSERT INTO nodes (id,parent_id,title,kind,content,created_at,updated_at)
    VALUES ('special-virtual-root',NULL,'Virtual','folder','','2026-01-01','2026-01-01'),
    ('filtered','special-virtual-root','Filtered','folder','','2026-01-01','2026-01-01'),
    ('other','folder','Other','topic','Other body','2026-01-01','2026-01-01')`);
  library.database.prepare('UPDATE nodes SET virtual_filter = ? WHERE id = ?').run(filter, 'filtered');
  if (location === 'internal') library.database.exec("UPDATE nodes SET parent_id = 'folder' WHERE id = 'filtered'");
  library.database.exec("UPDATE nodes SET content = 'needle original' WHERE id = 'article'");
  await start();
  fireEvent.click(await screen.findByTestId('companion-tab-shortcut'));
  if (location === 'virtual') fireEvent.click(await screen.findByTestId('companion-directory-node-special-virtual-root'));
  else fireEvent.click(await screen.findByRole('button', { name: 'Open folder Folder' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Open folder Filtered' }));
  const row = await screen.findByRole('button', { name: 'Open topic Article' });
  const page = row.closest('[data-companion-page]');
  fireEvent.click(row);
  await screen.findByTestId('companion-article-document');
  expect(listCompanionOpenVirtualFolders()).toContain('filtered');
  library.database.exec("UPDATE nodes SET content = 'other', updated_at = '2026-11-03' WHERE id = 'article'");
  library.database.exec("UPDATE nodes SET content = 'needle replacement', updated_at = '2026-11-03' WHERE id = 'other'");
  await publishCommittedFacts(['article', 'other']);
  await exitReader();
  expect(await screen.findByRole('button', { name: 'Open topic Other' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Open topic Article' })).toBeNull();
  expect(screen.getByTestId('companion-scroll-container')).toBe(page);
  fireEvent.click(screen.getByTestId('companion-top-bar-back'));
  await waitFor(() => expect(listCompanionOpenVirtualFolders()).not.toContain('filtered'));
});
