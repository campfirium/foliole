// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { refreshCompanionWorkspaceSnapshot } from '../companionWorkspaceSnapshotRefresh';
import { subscribePreparedCompanionWorkspace } from '../companionWorkspaceSnapshotStore';
import { createDisplayLibrary } from '../sync/workspace-state/companionDisplaySnapshotConcurrency.testSupport';

import type { CapacitorCompanionDatabaseOwner } from './capacitorCompanionDatabaseOwner';
import { openCompanionDailyFlow } from './companionDailyFlow';

const runtime = vi.hoisted(() => ({ owner: null as CapacitorCompanionDatabaseOwner | null }));
vi.mock('./iosCompanionDatabaseBootstrap', () => ({ getIosCompanionDatabaseOwner: () => runtime.owner! }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: () => ({})
}));
const now = '2026-10-28T08:00:00.000Z';

it.each(['android', 'ios'] as const)('%s reuses a Flow-prepared index without reprojecting the directory node facts', async platform => {
  let factReads = 0;
  const unsubscribe = subscribePreparedCompanionWorkspace(async (source, snapshot) => {
    if (source !== runtime.owner) return;
    for (const node of Object.values(snapshot.nodesById)) {
      const priority = node.priority;
      Object.defineProperty(node, 'priority', { enumerable: true, get: () => { factReads++; return priority; } });
    }
  });
  const library = createDisplayLibrary(platform);
  runtime.owner = library.owner;
  try {
    await library.owner.open({ expectedHostName: 'display-fixture', now });
    await library.owner.runWriter(async db => {
      await db.run(`INSERT INTO nodes (id,kind,title,created_at,updated_at,priority)
        VALUES ('parent','folder','Source',?,?,2)`, [now, now]);
      for (let index = 0; index < 128; index++) await db.run(`INSERT INTO nodes
        (id,parent_id,title,content,created_at,updated_at) VALUES (?,'parent',?,'Complete body',?,?)`,
      [`topic-${index}`, `Title ${index}`, now, now]);
    });
    const first = await openCompanionDailyFlow({ now, mode: 'reading-only' });
    expect(first.session.totalNodeCount).toBe(128);
    const before = await library.owner.read(async db => library.owner.readNodeMetadata(db));
    const snapshot = await refreshCompanionWorkspaceSnapshot();
    expect(factReads).toBe(0);
    expect(Object.keys(snapshot!.nodesById)).toHaveLength(130);
    expect(snapshot!.nodesById['topic-17']).toMatchObject({ title: 'Title 17', parentNodeId: 'parent', hasContent: true });
    expect(await library.owner.read(async db => library.owner.readNodeMetadata(db))).toBe(before);
    expect(await library.owner.read(async db => (await library.owner.readNodeIndex(db, 5)).paths.get('topic-17')))
      .toEqual(['parent', 'topic-17']);
    expect((await openCompanionDailyFlow({ now, mode: 'reading-only' })).session).toEqual(first.session);
    factReads = 0;
    library.owner.clearNodePriorities();
    const cold = await refreshCompanionWorkspaceSnapshot({ kind: 'full' });
    expect(factReads).toBeGreaterThan(0);
    expect(cold).toEqual(snapshot);
    expect(await library.owner.read(async db => library.owner.readNodeMetadata(db))).not.toBe(before);
    expect((await openCompanionDailyFlow({ now, mode: 'reading-only' })).session).toEqual(first.session);
  } finally { unsubscribe(); await library.close(); runtime.owner = null; }
});
