// @vitest-environment node
import { mkdirSync, writeFileSync } from 'node:fs';

import { expect, it, vi } from 'vitest';

import { loadCompanionWorkspaceNodeFromDb } from '../../../../../lib/core/database/companionWorkspaceNodeRead';
import { toWorkspaceNativeNodeVersion } from '../../../../../lib/core/database/workspaceNodeSyncVersion';
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

async function seed(library: Library) {
  await library.owner.open({ expectedHostName: 'display-fixture', now });
  await library.owner.runWriter(async db => {
    await db.run(`INSERT INTO nodes (id,kind,title,created_at,updated_at,priority)
      VALUES ('root-0123456789abcdef-0123456789abcdef','folder','Root',?,?,2)`, [now, now]);
    for (let i = 0; i < 128; i++) await db.run(`INSERT INTO nodes
      (id,parent_id,title,content,created_at,updated_at,deleted_at,priority)
      VALUES (?, 'root-0123456789abcdef-0123456789abcdef', ?, 'Complete body', ?, ?, ?, ?)`,
    [`node-${i}`, `Topic ${i}`, now, now, i === 3 ? now : null, i === 0 ? 0 : null]);
    await db.run(`INSERT INTO node_reading (node_id,last_handled_at,next_at,priority,repetition_count)
      VALUES ('node-1',?,?,7,3)`, [now, now]);
  });
}

async function generate(library: Library) {
  await library.owner.runWriter(async db => {
    await db.run('DELETE FROM daily_flow_state');
    await db.run('DELETE FROM daily_flow_entries');
    await db.run('DELETE FROM daily_flow_operations');
  });
  const result = await openCompanionDailyFlow({ now, mode: 'reading-only' });
  const rows = await library.owner.read(db => db.query('SELECT * FROM daily_flow_entries ORDER BY order_key'));
  return { result, rows };
}

it.each(['android', 'ios'] as const)('%s reuses prepared node facts while retaining complete first-generation output', async platform => {
  const library = createDisplayLibrary(platform);
  runtime.owner = library.owner;
  try {
    await seed(library);
    const facts = () => library.owner.read(db => db.query(`SELECT n.*, rd.* FROM nodes n
      LEFT JOIN node_reading rd ON rd.node_id=n.id ORDER BY n.id`));
    const before = await facts();
    const cold = await generate(library);
    const coldRead = library.flowNodeReads.at(-1)!;
    library.owner.clearNodePriorities();
    await refreshCompanionWorkspaceSnapshot();
    const metadata = await library.owner.read(async db => library.owner.readNodeMetadata(db));
    expect([...metadata!.values()].every(node => !('reading' in node) && !('review' in node) && !('content' in node))).toBe(true);
    const warm = await generate(library);
    const warmRead = library.flowNodeReads.at(-1)!;
    expect(warm).toEqual(cold);
    expect(warm.rows).toHaveLength(127);
    expect(await facts()).toEqual(before);
    expect(warmRead.rows).toBe(coldRead.rows);
    expect(warmRead.bytes).toBeLessThan(coldRead.bytes * 0.35);
    mkdirSync('.tmp/artifacts/T441/node-eligibility', { recursive: true });
    writeFileSync(`.tmp/artifacts/T441/node-eligibility/${platform}.json`, JSON.stringify({ coldRead, warmRead }));
  } finally { await library.close(); runtime.owner = null; }
});

it.each(['android', 'ios'] as const)('%s keeps ancestor shelving current through committed mutations and reopening', async platform => {
  const library = createDisplayLibrary(platform);
  runtime.owner = library.owner;
  try {
    await seed(library);
    const records = await library.owner.read(async db => Promise.all(['node-0', 'node-1'].map(async id => {
      const node = await loadCompanionWorkspaceNodeFromDb(db, id);
      return toWorkspaceNativeNodeVersion(node!, 'fixture', `seed-${id}`);
    })));
    await applyCompanionLocalNodeVersions(records);
    await refreshCompanionWorkspaceSnapshot();
    await mutateCompanionWorkspace({ type: 'move', nodeId: 'node-1', parentNodeId: 'node-0' });
    await mutateCompanionWorkspace({ type: 'shelve', nodeId: 'node-0' });
    const warm = await generate(library);
    expect(warm.rows).toHaveLength(125);
    expect(warm.rows.map(row => row.node_id)).not.toContain('node-0');
    expect(warm.rows.map(row => row.node_id)).not.toContain('node-1');
    library.owner.clearNodePriorities();
    expect(await generate(library)).toEqual(warm);
    await mutateCompanionWorkspace({ type: 'unshelve', nodeId: 'node-0' });
    const restored = await generate(library);
    expect(restored.rows).toHaveLength(127);
    expect(restored.rows.map(row => row.node_id)).toEqual(expect.arrayContaining(['node-0', 'node-1']));
  } finally { await library.close(); runtime.owner = null; }
});
