// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

import { parseChangedAttachmentArticles } from '../../lib/core/sync/attachmentDemandPreparation.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readRequestSyncInventorySnapshot } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { withRequestSyncAttachmentPreparation } from '../../lib/core/sync/requestSyncAttachmentPreparation.js';
import { applyReceivedRequestSyncBatch, type StagedRequestSyncObject } from '../../lib/core/sync/requestSyncBatchApply.js';
import { withRequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
import { restoreFixture } from '../database/requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

import { demandFixture, imageBody, imageKey } from './attachmentDemandQueue.testSupport.js';
import { peerState } from './attachmentPreparationHttp.testSupport.js';

it.each(['before-write', 'after-write'])('recovers durable demand after reopening %s', async boundary => {
  const root = await mkdtemp(path.resolve('.tmp/artifacts/T626/recovery-'));
  const file = path.join(root, 'library.db');
  let f = demandFixture(file);
  try {
    f.insert('article');
    const host = { ...f.host, write: async <T>(write: (db: DbPort) => Promise<T>) => {
      if (boundary === 'before-write') throw new Error('interrupted');
      const value = await f.host.write(write);
      throw Object.assign(new Error('interrupted'), { value });
    } };
    await expect(parseChangedAttachmentArticles(host, () => false)).rejects.toThrow('interrupted');
    f.sqlite.close(); f = demandFixture(file);
    expect(f.queued()).toEqual(boundary === 'before-write' ? ['article'] : []);
    expect(f.pending()).toEqual(boundary === 'before-write' ? [] : [imageKey(1)]);
    await parseChangedAttachmentArticles(f.host, () => false);
    expect(f.pending()).toEqual([imageKey(1)]); expect(f.queued()).toEqual([]);
  } finally { f.sqlite.close(); await rm(root, { recursive: true, force: true }); }
});

it('prepares only committed replay objects after a whole batch rolls back', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const records = ['good', 'bad'].map((id, index) => {
      const record = textBranch(`v-${id}`, imageBody(imageKey(index + 1)));
      return { ...record, object_id: id, snapshot: { ...record.snapshot, id } };
    });
    await applyConvergentSyncNodesWithDbPort(source.db, records);
    target.sqlite.exec("CREATE TRIGGER reject_bad BEFORE INSERT ON nodes WHEN NEW.id = 'bad' BEGIN SELECT RAISE(ABORT, 'bad_node'); END");
    const differences = compareFramedSyncInventories({ local: await readRequestSyncInventorySnapshot(source.db), remote: [] })
      .filter(value => value.globalId === 'good' || value.globalId === 'bad').sort((a, b) => b.globalId.localeCompare(a.globalId));
    const staged: StagedRequestSyncObject[] = [];
    async function receive(index: number): Promise<void> {
      if (index < differences.length) return withRequestSyncFiles(source.host.files, async files => {
        const difference = differences[index]!;
        const entry = await writeRequestSyncSnapshot(source.db, difference, files);
        staged.push({ files, header: { ...entry, currentVersionId: entry.currentVersionId ?? '',
          sourceStateHash: entry.sharedStateHash, requestId: new Uint8Array(16).fill(index + 1) } });
        await receive(index + 1);
      });
      const notified: string[] = [];
      const host = { ...target.host, objectApplied: (object: { globalId: string }) => { notified.push(object.globalId); } };
      await withRequestSyncAttachmentPreparation(host, undefined, async prepared => {
        const results = await applyReceivedRequestSyncBatch(prepared, {
          context: { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION, initiatorDeviceId: source.id, initiatorLibraryEpoch: source.epoch,
            responderDeviceId: target.id, responderLibraryEpoch: target.epoch }, author: 'initiator', peerState: peerState(source.id)
        }, staged);
        expect(results.map(result => result.error === '')).toEqual([true, false]);
      });
      expect(notified).toEqual(['good']);
    }
    await receive(0);
    target.reopen();
    expect(await target.db.query("SELECT id, content, current_version_id FROM nodes WHERE id IN ('good', 'bad')"))
      .toEqual([{ id: 'good', content: imageBody(imageKey(1)), current_version_id: 'v-good' }]);
    expect(await target.db.query('SELECT storage_key FROM attachment_pending')).toEqual([{ storage_key: imageKey(1) }]);
    expect(await target.db.query('SELECT * FROM attachment_parse_queue')).toEqual([]);
  } finally { await fixture.close(); }
});
