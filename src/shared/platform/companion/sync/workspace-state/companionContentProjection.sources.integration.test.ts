// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { refreshCompanionWorkspaceSnapshot } from '../../companionWorkspaceSnapshotRefresh';
import type { CapacitorCompanionDatabaseOwner } from '../../runtime/capacitorCompanionDatabaseOwner';

import { loadCompanionContentProjection } from './companionContentProjection';
import { createDisplayLibrary } from './companionDisplaySnapshotConcurrency.testSupport';

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
  registerPlugin: () => ({})
}));
const runtime = vi.hoisted(() => ({ owner: null as CapacitorCompanionDatabaseOwner | null }));
vi.mock('../../runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => runtime.owner!
}));

const lifecycle = { checkedAt: '2026-10-03T00:00:00.000Z', connectionRef: 'fixture',
  export: 'present', reader: 'present', scope: { readerLocation: 'all', version: 1 } };

it.each(['android', 'ios'] as const)('%s content refresh preserves unread sources without querying them or escalating', async platform => {
  const library = createDisplayLibrary(platform);
  runtime.owner = library.owner;
  try {
    await library.owner.open({ expectedHostName: 'display-fixture', now: '2026-10-18T00:00:00Z' });
    await library.owner.runWriter(async db => {
      await db.run(`INSERT INTO nodes (id, parent_id, title, content, created_at, updated_at) VALUES
        ('topic', NULL, 'Topic', 'Body', 'now', 'now'),
        ('child', 'topic', 'Child', 'Child body', 'now', 'now'),
        ('unrelated', NULL, 'Unrelated', 'Other body', 'now', 'now')`);
      for (const [id, node, date, state, provider] of [
        ['older', 'topic', '2026-10-01', { ...lifecycle, reader: 'missing' }, 'readwise'],
        ['latest', 'topic', '2026-10-02', lifecycle, 'readwise'],
        ['other-provider', 'topic', '2026-10-03', { ...lifecycle, export: 'deleted' }, 'other'],
        ['child-source', 'child', '2026-10-02', lifecycle, 'readwise']
      ] as const) {
        await db.run(`INSERT INTO import_sources (source_fingerprint, provider, source_kind, source_name,
          source_locator, first_imported_at, last_imported_at, last_content_fingerprint, latest_node_id,
          remote_provider, remote_import_state_json) VALUES (?, 'fixture', 'document', 'fixture',
          'fixture', '2026-10-01', ?, 'fixture', ?, ?, ?)`, [id, date, node, provider,
          JSON.stringify({ remoteLifecycle: state })]);
      }
    });
    const before = await refreshCompanionWorkspaceSnapshot({ kind: 'full' });
    expect(before!.nodesById.topic!.readwiseRemoteLifecycle).toEqual(lifecycle);
    expect(before!.nodesById.child!.readwiseRemoteLifecycle).toEqual(lifecycle);
    expect(before!.nodesById.unrelated!.readwiseRemoteLifecycle).toBeNull();
    // Make any hidden source read fail in SQLite rather than checking SQL source text.
    await library.owner.runWriter(async db => {
      await db.run('ALTER TABLE import_sources RENAME TO withheld_import_sources');
      await db.run("UPDATE nodes SET content = '', opening_text = 'Changed' WHERE id IN ('topic', 'child')");
    });
    const projected = await library.owner.readSnapshot(db => loadCompanionContentProjection(db, ['topic']));
    expect(Object.keys(projected).sort()).toEqual(['child', 'topic']);
    expect(Object.values(projected).every(node => !Object.hasOwn(node, 'readwiseRemoteLifecycle'))).toBe(true);
    const fullReads = library.fullDirectoryQueries();
    const refreshed = await refreshCompanionWorkspaceSnapshot({ kind: 'nodes', nodeIds: ['topic'] });
    expect(library.fullDirectoryQueries()).toBe(fullReads);
    expect(refreshed!.nodesById.topic).toMatchObject({ hasContent: false, openingText: 'Changed',
      readwiseRemoteLifecycle: lifecycle });
    expect(refreshed!.nodesById.child).toMatchObject({ hasContent: false, readwiseRemoteLifecycle: lifecycle });
    expect(refreshed!.nodesById.unrelated).toBe(before!.nodesById.unrelated);
    expect(await refreshCompanionWorkspaceSnapshot({ kind: 'nodes', nodeIds: ['topic'] })).toBe(refreshed);
    await library.owner.runWriter(db => db.run('ALTER TABLE withheld_import_sources RENAME TO import_sources'));
    expect(refreshed).toEqual(await refreshCompanionWorkspaceSnapshot({ kind: 'full' }));
  } finally {
    await library.close();
    runtime.owner = null;
  }
});
