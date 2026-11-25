// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { LocalizationProvider } from '../shared/localization/LocalizationProvider';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { mutateCompanionWorkspace } from '../shared/platform/companion/runtime/companionWorkspaceMutations';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { CompanionTopicListMenu } from './CompanionTopicListMenu';
import { CompanionWorkspaceActionsProvider, CompanionWorkspaceHistoryActions } from './CompanionWorkspaceActions';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: createCompanionNativeSyncStub };
});

const DAY = 24 * 60 * 60 * 1000;
let library: Awaited<ReturnType<typeof createSearchLibrary>>;
let initial: WorkspaceSnapshot;
const stored = async () => (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
beforeEach(async () => {
  localStorage.clear();
  library = await createSearchLibrary(0);
  await mutateCompanionWorkspace({ type: 'create', nodeId: 'folder', kind: 'folder', parentNodeId: null, title: 'Folder' });
  await mutateCompanionWorkspace({ type: 'create', nodeId: 'topic', kind: 'topic', parentNodeId: 'folder', title: 'Topic' });
  initial = await stored();
});
afterEach(async () => { cleanup(); await library.close(); });

function Harness({ flowActive = false }: { flowActive?: boolean }) {
  const [snapshot, setSnapshot] = useState(initial);
  return <LocalizationProvider initialLanguagePreference="en"><CompanionWorkspaceActionsProvider snapshot={snapshot}
    flush={async () => {}} restoreFlow={() => {}} flowActive={flowActive} applyFlow={async () => {}}
    refresh={async () => { const next = await stored(); setSnapshot(next); return next; }}>
    <CompanionWorkspaceHistoryActions />
    <CompanionTopicListMenu nodeId="topic" title="Topic" />
  </CompanionWorkspaceActionsProvider></LocalizationProvider>;
}

it('postpones a topic by a chosen number of days from its menu and offers to undo the postpone', async () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'More: Topic' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Topic' })).getByRole('button', { name: 'Postpone Topic' }));
  const sheet = within(await screen.findByRole('dialog', { name: 'Topic' }));
  fireEvent.click(sheet.getByRole('button', { name: 'By day' }));
  fireEvent.change(sheet.getByRole('textbox', { name: 'Days until next appearance' }), { target: { value: '12' } });
  const before = Date.now();
  fireEvent.click(sheet.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Undo Postpone' })).toBeEnabled());
  const nextAt = Date.parse((await stored()).nodesById.topic!.reading!.nextAt);
  expect(nextAt).toBeGreaterThanOrEqual(before + 12 * DAY);
  expect(nextAt).toBeLessThan(Date.now() + 12 * DAY + 1000);
  expect(localStorage.length).toBeGreaterThan(0);
});

it('postpones by weeks with the slider', async () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'More: Topic' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Topic' })).getByRole('button', { name: 'Postpone Topic' }));
  const sheet = within(await screen.findByRole('dialog', { name: 'Topic' }));
  fireEvent.change(sheet.getByRole('slider', { name: 'Postpone delay' }), { target: { value: '2' } });
  const before = Date.now();
  fireEvent.click(sheet.getByRole('button', { name: 'Confirm' }));
  await waitFor(async () => expect((await stored()).nodesById.topic?.reading?.nextAt).toBeTruthy());
  expect(Date.parse((await stored()).nodesById.topic!.reading!.nextAt)).toBeGreaterThanOrEqual(before + 14 * DAY);
});

it('leaves the postpone to Later while a Flow is open', () => {
  render(<Harness flowActive />);
  fireEvent.click(screen.getByRole('button', { name: 'More: Topic' }));
  expect(within(screen.getByRole('dialog', { name: 'Topic' })).queryByRole('button', { name: 'Postpone Topic' })).toBeNull();
});
