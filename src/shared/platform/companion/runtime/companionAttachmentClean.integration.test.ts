// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

import { saveForegroundTime } from '../../../../../lib/core/database/foregroundTimeStore';

import { runCompanionAttachmentMaintenance } from './companionAttachmentMaintenance';
import { companionNodeSqliteLibrary } from './companionNodeSqlite.testSupport';
import { iosCompanionContentHash, iosCompanionHostName, markIosCompanionMutation } from './iosCompanionMutationState';

const native = vi.hoisted(() => ({ maintainAttachmentFiles: vi.fn() }));
vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('./companionNativeSync.testSupport');
  return {
    Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false },
    registerPlugin: () => ({ ...createCompanionNativeSyncStub(), ...native })
  };
});

const image = `${'a'.repeat(64)}.png`;
const day = '2026-11-24';
let files: Array<{ storageKey: string; sizeBytes: number }>;
let trash: typeof files;
let afterObservation: (() => Promise<void>) | undefined;

beforeEach(() => {
  files = [{ storageKey: image, sizeBytes: 9 }];
  trash = [];
  afterObservation = undefined;
  native.maintainAttachmentFiles.mockImplementation(async ({ operation, trash: inTrash, storageKey }) => {
    if (operation === 'generation') return { generation: 'fixture' };
    if (operation === 'read-state') return { state: JSON.stringify({
      automatic: false, databaseGeneration: 'fixture', lastObservationDay: day,
      observationThreshold: 30, counts: { [image]: 30 }
    }) };
    if (operation === 'inventory') return { files: inTrash ? trash : files };
    if (operation === 'write-state') { await afterObservation?.(); return {}; }
    if (operation === 'move' && inTrash && storageKey === image) {
      trash = files;
      files = [];
      return { available: false };
    }
    throw new Error(`unexpected_attachment_operation:${operation}`);
  });
});

type Owner = Awaited<ReturnType<ReturnType<typeof companionNodeSqliteLibrary>['open']>>;

function recordUsage(owner: Owner) {
  return owner.runWriter(db => saveForegroundTime(db, {
    sourceId: 'fixture',
    buckets: [{ day, durationMs: 60_000 }],
    hash: iosCompanionContentHash,
    mark: async (tx, record) => markIosCompanionMutation({ db: tx,
      hostName: await iosCompanionHostName(tx), objectType: 'foreground_source',
      objectId: record.id, contentHash: record.hash, updatedAt: record.updatedAt })
  }), { kind: 'usage' });
}

it('moves eligible attachments even when the foreground checkpoint commits between scan reads', async () => {
  const library = companionNodeSqliteLibrary();
  try {
    const owner = await library.open();
    const read = owner.readBackgroundSnapshot.bind(owner);
    let saved = false;
    owner.readBackgroundSnapshot = async (task, signal) => {
      const result = await read(task, signal);
      if (!saved) { saved = true; await recordUsage(owner); }
      return result;
    };

    const result = await runCompanionAttachmentMaintenance({ action: 'clean' });
    expect(result).toMatchObject({ observationComplete: true, trashBytes: 9, usedBytes: 9 });
    expect(trash).toEqual([{ storageKey: image, sizeBytes: 9 }]);
    expect(files).toEqual([]);
    expect(await owner.read(db => db.query('SELECT duration_ms FROM foreground_daily_time')))
      .toEqual([{ duration_ms: 60_000 }]);
  } finally { await library.dispose(); }
});

it('blocks the move when a newly saved reference overtakes the clean scan', async () => {
  const library = companionNodeSqliteLibrary();
  try {
    const owner = await library.open();
    afterObservation = async () => {
      afterObservation = undefined;
      await owner.runWriter(db => db.run(
        "INSERT INTO nodes (id, title, content, created_at, updated_at) VALUES ('new-topic', 'Topic', ?, 'now', 'now')",
        [`![image](asset://${image})`]
      ), { kind: 'business' });
    };
    await expect(runCompanionAttachmentMaintenance({ action: 'clean' })).rejects.toThrow('attachment_scan_database_changed');
    expect(trash).toEqual([]);
    expect(files).toEqual([{ storageKey: image, sizeBytes: 9 }]);
    expect(await owner.read(db => db.query("SELECT content FROM nodes WHERE id = 'new-topic'")))
      .toEqual([{ content: `![image](asset://${image})` }]);
  } finally { await library.dispose(); }
});
