import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';

import type { DbPort } from '../../lib/core/sync/dbPort';
import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import { companionNodeSqliteLibrary } from '../shared/platform/companion/runtime/companionNodeSqlite.testSupport';
import {
  applyCompanionSyncGroupMemberState, loadCompanionSyncGroupMemberState
} from '../shared/platform/companion/sync/syncGroupMemberStateStore';
import { joinCompanionSyncGroup } from '../shared/platform/companion/sync/syncGroupStore';

import { CompanionDirectoryContent } from './CompanionDirectoryContent';
import { CompanionSearchContent } from './CompanionSearchContent';
import { CompanionSearchExternalArticle } from './CompanionSearchExternalArticle';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return {
    Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false },
    registerPlugin: createCompanionNativeSyncStub
  };
});

vi.mock('./CompanionReadableArticleSurface', () => ({
  ImmersiveReadableArticle: ({ readableArticle }: { readableArticle: { title: string } }) => {
    const [readingPosition, setReadingPosition] = useState(0);
    return <article aria-label={readableArticle.title}>
      {readableArticle.title}
      <button onClick={() => setReadingPosition(3)} type="button">Reading position {readingPosition}</button>
    </article>;
  }
}));

const groupId = 'directory-group';
const identity = (name: string) => createSyncGroupDeviceIdentity({
  device_anchor: crypto.randomUUID(), group_id: groupId, library_path: `/${name}/library.db`, path_flavor: 'posix'
});

async function seedMirror(db: DbPort, ownerKey: string, folder: string, title: string) {
  const source = `external:${folder}`;
  await db.run(`INSERT INTO desktop_sources (source_ref, source_type, config_ref, type_settings_json, host_name, host_platform, root_path, path_flavor, created_at, updated_at)
    VALUES (?, 'external', ?, ?, 'Provider', 'darwin', '/mirror', 'posix', 'now', 'now')`,
  [source, folder, JSON.stringify({ ownerDeviceIdentityKey: ownerKey })]);
  await db.run(`INSERT INTO external_search_folders (id, folder_path, source_ref, attachment_mode, document_count, created_at, updated_at)
    VALUES (?, '/mirror', ?, 'document_relative', 1, 'now', 'now')`, [folder, source]);
  await db.run(`INSERT INTO external_documents (document_id, folder_id, relative_path, file_name, extension,
    source_size_bytes, source_modified_at, source_modified_ms, content_hash, title, content, indexed_at, created_at, updated_at)
    VALUES (?, ?, 'note.md', 'note.md', 'md', 4, 'now', 0, 'hash', ?, 'Body', 'now', 'now', 'now')`,
  [`${folder}:note`, folder, title]);
}

it('hides departed External documents in the mounted directory, search and readers while preserving another reader', async () => {
  const library = companionNodeSqliteLibrary();
  const onExitArticle = vi.fn();
  const onExitSearch = vi.fn();
  const sender = identity('sender');
  const provider = identity('provider');
  const now = new Date().toISOString();
  let view: ReturnType<typeof renderWithLocalization> | undefined;
  try {
    const owner = await library.open();
    await joinCompanionSyncGroup({ mode: 'use-group', endpointUrl: 'http://sender.local',
      device: identity('mobile'), deviceName: 'Mobile', displayName: 'Group', platform: 'android',
      provider: { device: sender, deviceName: 'Sender', platform: 'darwin' }, workgroupKey: 'fixture' });
    const state = await loadCompanionSyncGroupMemberState();
    const providerMember = { ...state.devices[0]!, device_identity_key: provider.identity_key,
      device_anchor: provider.device_anchor, canonical_library_path: provider.canonical_library_path };
    const incoming = { ...state, sender_device_identity_key: sender.identity_key };
    delete incoming.adopting_from;
    await applyCompanionSyncGroupMemberState({ ...incoming, devices: [...state.devices, providerMember] }, sender.identity_key);
    await owner.runWriter(async db => {
      await seedMirror(db, provider.identity_key, 'mirror', 'Mirrored note');
      await seedMirror(db, sender.identity_key, 'remaining', 'Remaining note');
    }, { kind: 'business' });
    const props = { onChangeSelection: vi.fn(), onSelectNode: vi.fn(), onExitArticle, snapshot: null,
      sortDirection: 'asc', sortKey: 'name' } as const;
    view = renderWithLocalization(<>
      <CompanionDirectoryContent {...props} selection={{ kind: 'externalFolder', folderId: 'mirror' }} />
      <CompanionDirectoryContent {...props} articleOnly selection={{ kind: 'externalDocument', documentId: 'mirror:note' }} />
      <CompanionDirectoryContent {...props} articleOnly selection={{ kind: 'externalDocument', documentId: 'remaining:note' }} />
      <CompanionSearchContent onOpenExternalDocument={vi.fn()} />
      <CompanionSearchExternalArticle document={{ document_id: 'mirror:note' }} onExit={onExitSearch} />
    </>);
    expect(await screen.findByRole('button', { name: 'Open topic Mirrored note' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('article', { name: 'Mirrored note' })).toHaveLength(2));
    const remaining = await screen.findByRole('article', { name: 'Remaining note' });
    fireEvent.click(within(remaining).getByRole('button', { name: 'Reading position 0' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'note' } });
    expect(await screen.findByRole('button', { name: /^Mirrored note/u })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Remaining note/u })).toBeInTheDocument();

    await act(async () => {
      const devices = [...state.devices, { ...providerMember, state: 'left' as const, left_at: now, updated_at: now }];
      const applied = await applyCompanionSyncGroupMemberState({ ...incoming, devices }, sender.identity_key);
      expect(applied.normal_sync_ready).toBe(true);
    });

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Open topic Mirrored note' })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getAllByText('This result is no longer available.')).toHaveLength(2));
    expect(screen.queryByRole('article', { name: 'Mirrored note' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Mirrored note/u })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Remaining note/u })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reading position 3' })).toBeInTheDocument();
    for (const back of screen.getAllByRole('button', { name: 'Back' })) fireEvent.click(back);
    expect(onExitArticle).toHaveBeenCalledWith({ kind: 'root' });
    expect(onExitSearch).toHaveBeenCalledOnce();
    expect(await owner.read(db => db.query('SELECT content FROM external_documents WHERE document_id = ?', ['mirror:note'])))
      .toEqual([{ content: 'Body' }]);
  } finally {
    view?.unmount();
    await library.dispose();
  }
});
