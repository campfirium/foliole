// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';
import { createSearchLibrary, reopenSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { loadCompanionWorkspaceNode } from '../shared/platform/companion/runtime/companionWorkspaceNodeStore';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { CompanionCaptureSheet } from './CompanionCaptureSheet';
import { createCompanionCaptureTextSaveHandler } from './companionCaptureTextController';
import { createWorkspaceSnapshotActions } from './companionWorkspaceSyncActions';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

const clipboard = vi.hoisted(() => ({ text: '# Pasted title\n\nPasted body' }));
vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return {
    Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => true },
    registerPlugin: (name: string) => name === 'FolioleCompanionBootstrap'
      ? { readClipboardText: async () => ({ text: clipboard.text }) } : createCompanionNativeSyncStub()
  };
});

let library: Awaited<ReturnType<typeof createSearchLibrary>>;
beforeEach(async () => { window.localStorage.clear(); library = await createSearchLibrary(0); });
afterEach(async () => { cleanup(); await library.close(); });

it('pastes into a draft, saves an Inbox topic through the production writer and reloads its content', async () => {
  const initial = await loadCompanionWorkspaceSyncState();
  function Capture() {
    const [state, setState] = useState(initial);
    const [open, setOpen] = useState(true);
    const actions = createWorkspaceSnapshotActions({ state, setState, setError: () => {}, setStatus: () => {},
      setSyncConflictCount: () => {}, setSyncProgress: () => {} });
    const save = createCompanionCaptureTextSaveHandler({ ...actions, state, bootstrapState: { device_id: 'clipboard-device' }
    } as ReturnType<typeof useCompanionWorkspaceSync>);
    return <CompanionCaptureSheet draftScope="clipboard-integration" onSave={save} open={open} onOpenChange={setOpen} />;
  }
  renderWithLocalization(<Capture />);
  fireEvent.click(screen.getByRole('button', { name: 'Paste from Clipboard' }));
  await waitFor(() => expect(screen.getByLabelText('Capture text')).toHaveValue(clipboard.text));
  expect(library.database.prepare("SELECT id FROM nodes WHERE kind = 'topic'").all()).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.queryByLabelText('Capture text')).toBeNull());
  const topics = library.database.prepare("SELECT id, parent_id, title FROM nodes WHERE kind = 'topic'").all();
  expect(topics).toEqual([{ id: expect.any(String), parent_id: 'special-inbox', title: 'Pasted title' }]);
  await reopenSearchLibrary(library.root, '2026-10-30T00:00:00Z');
  const reloaded = await loadCompanionWorkspaceSyncState();
  const topic = Object.values(reloaded.workspace_snapshot!.nodesById).find(node => node.kind === 'topic');
  expect(topic).toMatchObject({ parentNodeId: 'special-inbox', title: 'Pasted title' });
  expect(await loadCompanionWorkspaceNode(topic!.id)).toMatchObject({ content: clipboard.text });
});
