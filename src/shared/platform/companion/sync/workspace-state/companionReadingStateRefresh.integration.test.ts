// @vitest-environment node
import { expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../../../../../lib/core/database/workspaceSnapshot';
import { applyNodeReadingObject } from '../../../../../../lib/core/sync/syncObjectLearningPayloadExecutor';
import { persistFlowMutation } from '../../../../../companion/companionFlowMutation';
import {
  saveCompanionSyncNodeReadingRecord
} from '../../../companionSyncStateWriters';
import { refreshCompanionWorkspaceAfterMutation } from '../../companionWorkspaceRepository';
import type { CapacitorCompanionDatabaseOwner } from '../../runtime/capacitorCompanionDatabaseOwner';

import { createDisplayLibrary } from './companionDisplaySnapshotConcurrency.testSupport';
import { loadIosCompanionWorkspaceSnapshot } from './iosCompanionWorkspaceSnapshotStore';

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
  registerPlugin: () => ({})
}));

const runtime = vi.hoisted(() => ({ owner: null as CapacitorCompanionDatabaseOwner | null }));
vi.mock('../../runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => runtime.owner!
}));

async function openLibrary() {
  const library = createDisplayLibrary('android');
  runtime.owner = library.owner;
  await library.owner.open({ expectedHostName: 'display-fixture', now: '2026-10-18T00:00:00Z' });
  await library.owner.runWriter(db => db.run(`INSERT INTO nodes (id, title, content, created_at, updated_at)
    VALUES ('a', 'A', 'Body A', 'now', 'now'), ('b', 'B', 'Body B', 'now', 'now')`));
  const baseline = await refreshCompanionWorkspaceAfterMutation();
  return { library, baseline, reads: library.fullDirectoryQueries() };
}

async function readComplete(): Promise<WorkspaceSnapshot | null> {
  return runtime.owner!.readSnapshot(db => loadIosCompanionWorkspaceSnapshot(db));
}

it('publishes every committed reading profile in a batch exactly as a complete database read', async () => {
  const { library, reads } = await openLibrary();
  const reading = {
    intervalDurationMs: 86_400_000, intervalGrowthFactor: 2,
    lastHandledAt: '2026-10-18T01:00:00.000Z', nextAt: '2026-10-19T01:00:00.000Z',
    priority: 1, readingPosition: 17, repetitionCount: 1, state: 'active' as const
  };
  try {
    await saveCompanionSyncNodeReadingRecord({ nodeId: 'a', reading });
    await saveCompanionSyncNodeReadingRecord({
      nodeId: 'b', reading: { ...reading, readingPosition: 0, repetitionCount: 0 }
    });
    const displayed = await refreshCompanionWorkspaceAfterMutation();
    expect(library.fullDirectoryQueries(), 'reading writes must not trigger a full directory read').toBe(reads);
    expect(displayed).toEqual(await readComplete());
    expect(displayed?.nodesById.a?.reading).toEqual(reading);
    expect(displayed?.nodesById.b?.reading).toEqual({
      ...reading, readingPosition: 0, repetitionCount: 0
    });
  } finally { await library.close(); }
});

it('persists the next sequential topic released by dismissing the current topic', async () => {
  const { library } = await openLibrary();
  const reading = {
    intervalDurationMs: 86_400_000, intervalGrowthFactor: 2,
    lastHandledAt: '2026-10-18T01:00:00.000Z', nextAt: '2026-10-19T01:00:00.000Z',
    priority: 1, readingPosition: 0, repetitionCount: 0, state: 'active' as const
  };
  try {
    await library.owner.runWriter(async db => {
      await db.run(`INSERT INTO nodes (id, kind, title, sequential_reading_enabled, created_at, updated_at)
        VALUES ('source', 'folder', 'Source', 1, 'now', 'now')`);
      await db.run("UPDATE nodes SET parent_id = 'source' WHERE id IN ('a', 'b')");
    });
    await saveCompanionSyncNodeReadingRecord({ nodeId: 'a', reading });
    await saveCompanionSyncNodeReadingRecord({ nodeId: 'b', reading: { ...reading, state: 'locked' } });
    const snapshot = await refreshCompanionWorkspaceAfterMutation();
    if (!snapshot) throw new Error('Expected a published workspace snapshot');
    expect(snapshot.nodesById.b?.reading?.state).toBe('locked');
    const previousSync = await library.owner.readSnapshot(db => db.query(
      "SELECT content_hash FROM sync_object_state WHERE object_type = 'node_reading' AND object_id = 'b'"));
    const reads = library.fullDirectoryQueries();
    const mutation = await persistFlowMutation({
      action: 'dismiss', nodeId: 'a', now: '2026-10-18T02:00:00.000Z', snapshot
    });
    expect(mutation.partial).toBe(false);
    expect(mutation.snapshot.nodesById.b?.reading?.state).toBe('active');
    const committed = await library.owner.readSnapshot(db => db.query(
      `SELECT r.state, s.content_hash FROM node_reading r JOIN sync_object_state s
        ON s.object_type = 'node_reading' AND s.object_id = r.node_id WHERE r.node_id = 'b'`));
    expect(committed[0]?.content_hash).not.toBe(previousSync[0]?.content_hash);
    expect(committed[0]?.state, 'the new sync hash must describe the committed unlocked profile').toBe('active');
    const displayed = await refreshCompanionWorkspaceAfterMutation();
    expect(library.fullDirectoryQueries(), 'both sequential changes must use committed node scopes').toBe(reads);
    expect(displayed).toEqual(await readComplete());
    expect(displayed?.nodesById.a?.reading?.state).toBe('dismissed');
    expect(displayed?.nodesById.b?.reading?.state).toBe('active');
  } finally { await library.close(); }
});

it('persists a local reading position without changing its shared reading profile', async () => {
  const { library } = await openLibrary();
  const reading = {
    intervalDurationMs: 1000, intervalGrowthFactor: 1,
    lastHandledAt: '2026-10-18T01:00:00.000Z', nextAt: '2026-10-19T01:00:00.000Z',
    priority: 1, readingPosition: 0, repetitionCount: 1, state: 'active' as const
  };
  try {
    const first = await saveCompanionSyncNodeReadingRecord({ nodeId: 'a', reading });
    const second = await saveCompanionSyncNodeReadingRecord({ nodeId: 'a', reading: { ...reading, readingPosition: 42 } });
    expect(first?.content_hash).toBe(second?.content_hash);
    const displayed = await refreshCompanionWorkspaceAfterMutation();
    expect(displayed?.nodesById.a?.reading).toEqual({ ...reading, readingPosition: 42 });
  } finally { await library.close(); }
});

it('still rejects an older remote reading profile after a newer local reading commit', async () => {
  const { library } = await openLibrary();
  const reading = {
    intervalDurationMs: 1000, intervalGrowthFactor: 1,
    lastHandledAt: '2026-10-18T01:00:00.000Z', nextAt: '2026-10-19T01:00:00.000Z',
    priority: 1, readingPosition: 42, repetitionCount: 2, state: 'active' as const
  };
  try {
    await saveCompanionSyncNodeReadingRecord({ nodeId: 'a', reading });
    const applied = await library.owner.runWriter(db => applyNodeReadingObject(db, {
      object_type: 'node_reading', object_id: 'a', content_hash: 'f'.repeat(64), deleted_at: null,
      updated_at: '2026-10-19T00:00:00.000Z', payload_json: JSON.stringify({
        state: 'locked', last_handled_at: '2026-10-17T00:00:00.000Z', repetition_count: 1
      })
    }));
    expect(applied).toBe(false);
    expect((await readComplete())?.nodesById.a?.reading).toEqual(reading);
  } finally { await library.close(); }
});

it.each([
  "UPDATE nodes SET deleted_at = 'now' WHERE id = 'a'",
  "UPDATE nodes SET parent_id = 'b' WHERE id = 'a'",
  "UPDATE nodes SET title = 'Renamed' WHERE id = 'a'"
])('uses a full snapshot when a reading commit overlaps a structural change: %s', async sql => {
  const { library, reads } = await openLibrary();
  try {
    await saveCompanionSyncNodeReadingRecord({ nodeId: 'a', reading: {
      intervalDurationMs: 1000, intervalGrowthFactor: 1,
      lastHandledAt: '2026-10-18T01:00:00.000Z', nextAt: '2026-10-19T01:00:00.000Z',
      priority: 1, readingPosition: 0, repetitionCount: 1, state: 'active'
    } });
    await library.owner.runWriter(db => db.run(sql));
    const displayed = await refreshCompanionWorkspaceAfterMutation();
    expect(library.fullDirectoryQueries()).toBe(reads + 1);
    expect(displayed).toEqual(await readComplete());
  } finally { await library.close(); }
});
