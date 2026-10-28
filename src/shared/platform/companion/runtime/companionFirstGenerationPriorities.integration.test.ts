// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { toWorkspaceNativeNodeVersion } from '../../../../../lib/core/database/workspaceNodeSyncVersion';
import type { WorkspaceNodeSnapshot } from '../../../../../lib/core/database/workspaceSnapshotHelpers';
import { hydrateCurrentReviewSchedulerSettings } from '../../../../features/settings/model/reviewSchedulerSettings';
import { applyCompanionLocalNodeVersions } from '../../companionSyncNodeVersions';
import { refreshCompanionWorkspaceSnapshot } from '../companionWorkspaceSnapshotRefresh';
import { createDisplayLibrary } from '../sync/workspace-state/companionDisplaySnapshotConcurrency.testSupport';

import type { CapacitorCompanionDatabaseOwner } from './capacitorCompanionDatabaseOwner';
import { openCompanionDailyFlow } from './companionDailyFlow';
import { mutateCompanionWorkspace } from './companionWorkspaceMutations';

const runtime = vi.hoisted(() => ({ owner: null as CapacitorCompanionDatabaseOwner | null }));
vi.mock('./iosCompanionDatabaseBootstrap', () => ({ getIosCompanionDatabaseOwner: () => runtime.owner! }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: () => ({})
}));
const now = '2026-10-28T08:00:00.000Z';
type Library = ReturnType<typeof createDisplayLibrary>;
const libraries: Library[] = [];
afterEach(async () => {
  for (const library of libraries.splice(0)) await library.close();
  runtime.owner = null;
  hydrateCurrentReviewSchedulerSettings({ pushQueue: { defaultPriority: 5 } });
});

function nodes(priority = 0): WorkspaceNodeSnapshot[] {
  const inputs = [
    { id: 'absolute', kind: 'folder', parentNodeId: null, priority },
    { id: 'regular', kind: 'folder', parentNodeId: null, priority: 9 },
    { id: 'branch', kind: 'folder', parentNodeId: 'absolute' },
    { id: 'leaf', kind: 'topic', parentNodeId: 'branch' },
    { id: 'zero', kind: 'topic', parentNodeId: null, priority: 0 },
    ...Array.from({ length: 10 }, (_, index) => ({ id: `default-${index}`, kind: 'topic', parentNodeId: null }))
  ];
  return inputs.map(node => ({ content: node.kind === 'folder' ? '' : `Complete body ${node.id}`,
    title: node.id, isTitleManual: true, hideTitleHeading: false, anchorLink: null,
    reading: null, review: null, reveal: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: now,
    ...node })) as WorkspaceNodeSnapshot[];
}

async function openLibrary(platform: 'android' | 'ios', priority = 0) {
  const library = createDisplayLibrary(platform);
  libraries.push(library);
  runtime.owner = library.owner;
  hydrateCurrentReviewSchedulerSettings({ pushQueue: { defaultPriority: 5 } });
  await library.owner.open({ expectedHostName: 'display-fixture', now });
  await applyCompanionLocalNodeVersions(await Promise.all(nodes(priority)
    .map(node => toWorkspaceNativeNodeVersion(node, 'fixture', `seed-${node.id}`))));
  return library;
}

async function originalFacts(library: Library) {
  return library.owner.read(async db => ({
    nodes: await db.query('SELECT id, parent_id, priority, content, reveal FROM nodes ORDER BY id'),
    reading: await db.query('SELECT * FROM node_reading ORDER BY node_id'),
    review: await db.query('SELECT * FROM node_review ORDER BY node_id')
  }));
}

async function generate(library: Library) {
  const before = await originalFacts(library);
  await library.owner.runWriter(async db => {
    await db.run('DELETE FROM daily_flow_state');
    await db.run('DELETE FROM daily_flow_entries');
    await db.run('DELETE FROM daily_flow_operations');
  });
  const result = await openCompanionDailyFlow({ now, mode: 'reading-only' });
  const rows = await library.owner.read(db => db.query<{ node_id: string; initial_task: number; active: number }>(
    'SELECT node_id, initial_task, active FROM daily_flow_entries ORDER BY order_key'));
  expect(rows.map(row => row.node_id).sort()).toEqual(['leaf', 'zero', ...Array.from({ length: 10 }, (_, i) => `default-${i}`)].sort());
  expect(rows.every(row => row.initial_task === 1 && row.active === 1)).toBe(true);
  expect(result.session.currentNodeId).toBe(rows[0]!.node_id);
  expect(result.session.totalNodeCount).toBe(12);
  expect(await originalFacts(library)).toEqual(before);
  expect((await openCompanionDailyFlow({ now, mode: 'reading-only' })).session).toEqual(result.session);
  return rows.map(row => row.node_id);
}

it.each(['android', 'ios'] as const)('%s generates the same complete durable order with a cold or directory-prepared owner', async platform => {
  const library = await openLibrary(platform);
  const cold = await generate(library);
  expect(new Set(cold.slice(0, 2))).toEqual(new Set(['leaf', 'zero']));
  library.owner.clearNodePriorities();
  await refreshCompanionWorkspaceSnapshot();
  expect(await generate(library)).toEqual(cold);
});

it.each(['android', 'ios'] as const)('%s generates from committed moves and preserves committed inheritance after a rejected move', async platform => {
  const library = await openLibrary(platform);
  await refreshCompanionWorkspaceSnapshot();
  const original = await generate(library);
  await mutateCompanionWorkspace({ type: 'move', nodeId: 'branch', parentNodeId: 'regular' });
  const moved = await generate(library);
  expect(moved[0]).toBe('zero');
  expect(moved).not.toEqual(original);
  library.owner.clearNodePriorities();
  expect(await generate(library)).toEqual(moved);
  await library.owner.runWriter(db => db.run(`CREATE TRIGGER reject_move BEFORE UPDATE OF parent_id ON nodes
    WHEN NEW.id='branch' BEGIN SELECT RAISE(ABORT, 'move rejected'); END`));
  await expect(mutateCompanionWorkspace({ type: 'move', nodeId: 'branch', parentNodeId: 'absolute' }))
    .rejects.toThrow('move rejected');
  expect(await generate(library)).toEqual(moved);
});

it.each(['android', 'ios'] as const)('%s uses a changed default in the first durable order without changing original priorities', async platform => {
  const library = await openLibrary(platform, 5);
  await refreshCompanionWorkspaceSnapshot();
  const before = await generate(library);
  hydrateCurrentReviewSchedulerSettings({ pushQueue: { defaultPriority: 9 } });
  const changed = await generate(library);
  expect(changed[0]).toBe('zero');
  expect(changed).not.toEqual(before);
  library.owner.clearNodePriorities();
  expect(await generate(library)).toEqual(changed);
});

it.each(['android', 'ios'] as const)('%s does not reuse another library priorities for identical node IDs', async platform => {
  const first = await openLibrary(platform);
  const previous = await generate(first);
  expect(new Set(previous.slice(0, 2))).toEqual(new Set(['leaf', 'zero']));
  const second = await openLibrary(platform, 9);
  const next = await generate(second);
  expect(next[0]).toBe('zero');
  expect(next).not.toEqual(previous);
  second.owner.clearNodePriorities();
  expect(await generate(second)).toEqual(next);
});
