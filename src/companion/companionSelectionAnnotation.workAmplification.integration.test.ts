// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { sqlRecording } from '../../lib/core/diagnostics/sqlRecording';
import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import { loadNewItemReviewLoadWithDb } from '../shared/platform/companion/runtime/companionNewItemReviewLoad';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { loadIosCompanionWorkspaceSnapshot } from '../shared/platform/companion/sync/workspace-state/iosCompanionWorkspaceSnapshotStore';
import { getSelectionCommandPayloadForContentRanges } from '../shared/selectionCommandPayload';
import { createNewItemReviewProfiles } from '../store/newItemReviewSlots';

import {
  addNoteToCompanionExistingHighlight,
  deleteCompanionExistingHighlight,
  persistCompanionSelectionAnnotation
} from './companionSelectionAnnotationActions';

// Work-amplification check: creating, editing and deleting an annotation on the phone, counted, never timed.
const reads = vi.hoisted(() => ({ fullSnapshots: 0 }));

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: createCompanionNativeSyncStub };
});
vi.mock('../shared/platform/companion/sync/workspace-state/iosCompanionWorkspaceSnapshotStore', async importOriginal => {
  const original = await importOriginal<typeof import('../shared/platform/companion/sync/workspace-state/iosCompanionWorkspaceSnapshotStore')>();
  return { ...original, loadIosCompanionWorkspaceSnapshot: (...args: Parameters<typeof original.loadIosCompanionWorkspaceSnapshot>) => {
    reads.fullSnapshots += 1;
    return original.loadIosCompanionWorkspaceSnapshot(...args);
  } };
});

const DAY_MS = 24 * 60 * 60 * 1000;
const content = 'Selected passage and surrounding context.';
const payload = getSelectionCommandPayloadForContentRanges('source', content, [{ from: 0, to: 16 }])!;
let library: Awaited<ReturnType<typeof createSearchLibrary>> | null = null;

async function openLibrary(size: number) {
  await library?.close();
  // An enlarged library: a whole-library read is the amplification this check counts.
  library = await createSearchLibrary(size, 16);
  const db = library.database;
  const node = db.prepare('INSERT INTO nodes (id,kind,title,content,parent_id,created_at,updated_at,deleted_at) VALUES (?,?,?,?,?,?,?,?)');
  const review = db.prepare('INSERT INTO node_review (node_id,due) VALUES (?,?)');
  const inDays = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString();
  db.transaction(() => {
    node.run('bulk', 'folder', 'bulk', '', null, '0', '0', null);
    db.prepare("UPDATE nodes SET parent_id = 'bulk' WHERE parent_id IS NULL AND id NOT LIKE 'special-%' AND id != 'bulk'").run();
    node.run('source', 'topic', 'Source', content, null, '1', '1', null);
    // Cards outside the days a new cloze spreads over grow with the library and must not be read.
    for (let i = 0; i < size; i++) {
      node.run(`card-${i}`, 'item', `card ${i}`, 'q', 'bulk', '2', '2', null);
      review.run(`card-${i}`, inDays(400 + i));
    }
    // A fixed load inside those days, with cards Trash hides directly and through their folder.
    node.run('due-a', 'item', 'due a', 'q', 'bulk', '3', '3', null);
    review.run('due-a', inDays(1));
    node.run('due-b', 'item', 'due b', 'q', 'bulk', '3', '3', null);
    review.run('due-b', inDays(1));
    node.run('due-gone', 'item', 'due gone', 'q', 'bulk', '3', '3', '4');
    review.run('due-gone', inDays(2));
    node.run('gone', 'folder', 'gone', '', null, '3', '3', '4');
    node.run('due-hidden', 'item', 'due hidden', 'q', 'gone', '3', '3', null);
    review.run('due-hidden', inDays(2));
  })();
  await refreshCompanionWorkspaceAfterMutation(null);
  reads.fullSnapshots = 0;
}
beforeEach(() => openLibrary(100));
afterEach(async () => { await library?.close(); library = null; });

const current = async () => (await refreshCompanionWorkspaceAfterMutation())!;
const create = async (kind: 'cloze' | 'highlight' | 'note') =>
  (await persistCompanionSelectionAnnotation({ deviceId: 'Search', kind, payload, note: 'Thought', snapshot: await current() }))!;

async function highlight() {
  const created = await create('highlight');
  await refreshCompanionWorkspaceAfterMutation();
  reads.fullSnapshots = 0;
  return created.nodeId;
}

const WRITES: Record<string, () => Promise<unknown>> = {
  highlight: () => create('highlight'),
  note: () => create('note'),
  cloze: () => create('cloze'),
  'highlight note': async () => {
    const nodeId = await highlight();
    return addNoteToCompanionExistingHighlight({ deviceId: 'Search', nodeId, note: 'Later', originalText: 'Selected passage',
      snapshot: await current() });
  },
  'highlight deletion': async () => {
    const nodeId = await highlight();
    return deleteCompanionExistingHighlight({ deviceId: 'Search', nodeId, snapshot: await current() });
  }
};

const facts = (value: WorkspaceSnapshot | null) => value && { ...value, trashedNodeIds: [...value.trashedNodeIds].sort() };

async function writeRows(size: number, write: () => Promise<unknown>) {
  await openLibrary(size);
  let rows = 0;
  const record = async (step: () => Promise<unknown>) => {
    sqlRecording.start({ label: 'annotation-write', maxGroups: 2000 });
    try { await step(); } finally { sqlRecording.stop(); }
    rows += sqlRecording.snapshot()!.groups.reduce((total, group) => total + group.returnedRows, 0);
  };
  // The baseline read before the write is the caller's snapshot, not part of the write.
  await record(write);
  await record(() => refreshCompanionWorkspaceAfterMutation());
  return rows;
}

for (const [name, write] of Object.entries(WRITES)) {
  it(`publishes a ${name} without reading the whole library`, async () => {
    const result = await write() as { published?: true } | null;
    expect(result?.published).toBe(true);
    const snapshot = await refreshCompanionWorkspaceAfterMutation();
    expect(reads.fullSnapshots).toBe(0);
    const complete = await getIosCompanionDatabaseOwner().readSnapshot(db => loadIosCompanionWorkspaceSnapshot(db));
    expect(facts(snapshot)).toEqual(facts(complete));
  });

  it(`reads the same number of rows for a ${name} however large the library is`, async () => {
    expect(await writeRows(400, write)).toBe(await writeRows(100, write));
  });
}

it('spreads a new cloze over the same review load the whole library shows', async () => {
  const owner = getIosCompanionDatabaseOwner();
  const now = new Date().toISOString();
  const complete = (await owner.readSnapshot(db => loadIosCompanionWorkspaceSnapshot(db)))!;
  const narrow = await owner.readSnapshot(db => loadNewItemReviewLoadWithDb(db, now));
  expect(narrow.map(node => node.review.due).sort()).toEqual(
    [complete.nodesById['due-a']!.review!.due, complete.nodesById['due-b']!.review!.due].sort());
  const expected = createNewItemReviewProfiles({ batchSize: 1, nodesById: complete.nodesById, now })[0]!;
  const created = await create('cloze');
  const snapshot = await refreshCompanionWorkspaceAfterMutation();
  expect(snapshot!.nodesById[created.nodeId]!.review!.due).toBe(expected.due);
});

it('refuses an annotation whose parent moved to Trash after the caller read it', async () => {
  const snapshot = await current();
  library!.database.prepare("UPDATE nodes SET deleted_at = '5' WHERE id = 'source'").run();
  expect(await persistCompanionSelectionAnnotation({ deviceId: 'Search', kind: 'highlight', payload, snapshot })).toBeNull();
  expect(library!.database.prepare("SELECT COUNT(*) FROM nodes WHERE parent_id = 'source'").pluck().get()).toBe(0);
});
