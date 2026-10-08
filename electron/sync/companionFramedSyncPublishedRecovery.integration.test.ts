// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { readFramedSyncPublishedBody } from '../../lib/core/sync/framedSyncPublishedBody.js';
import { inspectCompanionFramedSyncOutbound, prepareCompanionFramedSyncOutbound }
  from '../../src/shared/platform/companion/sync/framed/companionFramedSyncOutbound.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

import { publishFixtureDelivery } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture,
  type DesktopFramedSyncFixtureProcess } from './desktopFramedSyncTwoProcess.testSupport.js';

let root = '';
const processes: DesktopFramedSyncFixtureProcess[] = [];
afterEach(async ({ task }) => {
  await Promise.allSettled(processes.splice(0).map((process) => process.close()));
  if (root && task.result?.state !== 'fail') await fs.rm(root, { recursive: true, force: true });
});

const owner = z.object({ group_id: z.string(), receiver_device_id: z.string(),
  receiver_library_epoch: z.string(), sender_device_id: z.string(), sender_library_epoch: z.string() });

it('restores native input after normal collection and restart without current object selection', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  root = fixture.root;
  processes.push(fixture.left, fixture.right);
  const nodeId = 't328-companion-fixed-source';
  await fixture.left.seed({ content: 'Original body', nodeId, title: 'Original' });
  const transferId = await publishFixtureDelivery(fixture.left, fixture.rightSnapshot, 'publication');
  await fixture.left.seed({ content: 'Latest body', nodeId, title: 'Latest' });
  await fixture.left.invoke('collect_content');
  const restarted = await fixture.restartLeft();
  processes.push(restarted.process);
  const sqlite = new Database(restarted.snapshot.databasePath, { readonly: true });
  try {
    const context = owner.parse(sqlite.prepare('SELECT * FROM framed_sync_outbound_publications').get());
    const base = createBetterSqliteDbPort(sqlite);
    const db: DbPort = { ...base, query: async (sql, params) => {
      if (/\b(nodes|node_sync_versions|review_log)\b/u.test(sql)) {
        throw new Error('test_live_business_read_forbidden');
      }
      return base.query(sql, params);
    } };
    const input = { ...context, transfer_id: transferId, object_id: nodeId,
      include_current_node: false, required_relation_ids: [], review_fact_ids: [], state_fact_ids: [] };
    const restored = await prepareCompanionFramedSyncOutbound(db, input);
    expect(restored.transfer_id).toBe(transferId);
    expect(restored.blobs.every((blob) => blob.body_source === 'frozen_body' && blob.data_text === undefined)).toBe(true);
    const texts = [];
    for (const blob of restored.blobs) texts.push(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      await readFramedSyncPublishedBody(db, { groupId: context.group_id, protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
        receiverDeviceId: context.receiver_device_id, receiverLibraryEpoch: context.receiver_library_epoch,
        senderDeviceId: context.sender_device_id, senderLibraryEpoch: context.sender_library_epoch },
      { transferId, hash: blob.sha256, byteLength: Number(blob.byte_length) })));
    expect(texts).toContain('Original body');
    expect(texts).not.toContain('Latest body');
    await expect(inspectCompanionFramedSyncOutbound(db, input)).resolves.toEqual({
      resource_storage_keys: [] });
    await expect(prepareCompanionFramedSyncOutbound(db, {
      ...input, receiver_library_epoch: 'other-epoch'
    })).rejects.toThrow('framed_sync_publication_context_missing');
  } finally { sqlite.close(); }
});
