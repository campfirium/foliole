// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

import { completeAttachmentDemand, recordAttachmentDemandAttempt } from '../../lib/core/sync/attachmentDemandQueue.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { decodeFrameHeader } from '../../lib/core/sync/framedSyncFraming.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readRequestSyncInventorySnapshot } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { exchangeRequestSyncAttachments } from '../../lib/core/sync/requestSyncAttachmentExchange.js';
import { readRequestSyncAttachmentNeedsSlice } from '../../lib/core/sync/requestSyncAttachmentNeeds.js';
import { respondRequestSyncAttachments, type RequestSyncAttachmentHost } from '../../lib/core/sync/requestSyncAttachmentResponse.js';
import type { RequestSyncExchange } from '../../lib/core/sync/requestSyncDatabaseExchange.js';
import { withRequestSyncFiles, type RequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { applyRequestSyncObject } from '../../lib/core/sync/requestSyncObjectApply.js';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
import { restoreFixture, transfer, type RestorePeer } from '../database/requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

import { openDesktopAttachmentBlockReceiver } from './desktopAttachmentBlockFiles.js';
import { createDesktopAttachmentBlockSource, isDesktopAttachmentPresent } from './desktopAttachmentBlockSource.js';

async function attachments(peer: RestorePeer) {
  const assetsDir = path.join(peer.root, peer.id, 'Assets');
  await mkdir(assetsDir, { recursive: true });
  const receiver = await openDesktopAttachmentBlockReceiver({ libraryRoot: path.dirname(assetsDir), assetsDir,
    availability: async () => undefined });
  if (receiver.kind !== 'acquired') throw new Error('test_receiver_busy');
  const host: RequestSyncAttachmentHost = { ...receiver, ...createDesktopAttachmentBlockSource(assetsDir, peer.file),
    attempted: key => recordAttachmentDemandAttempt(peer.db, key),
    async receive(resource, offset, bytes) {
      const result = await receiver.receive(resource, offset, bytes);
      if (result.kind === 'complete') await completeAttachmentDemand(peer.db, resource.storageKey);
      return result;
    },
    needsSlice: budget => readRequestSyncAttachmentNeedsSlice(peer.host,
      keys => Promise.all(keys.map(key => isDesktopAttachmentPresent(assetsDir, key))), budget),
    needs: async () => (await host.needsSlice(() => false)).keys };
  return { host, assetsDir, close: () => receiver.close() };
}

async function content(source: RestorePeer, target: RestorePeer) {
  const differences = compareFramedSyncInventories({ local: await readRequestSyncInventorySnapshot(source.db),
    remote: await readRequestSyncInventorySnapshot(target.db) });
  for (const difference of differences.filter(item => item.direction === 'local_to_remote')) await transfer(source, target, {
    groupId: 'group', overwriteId: 'ordinary', providerDeviceId: source.id, providerLibraryEpoch: source.epoch,
    receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch
  }, difference, false);
}

function exchange(local: RestorePeer, remote: RestorePeer, host: RequestSyncAttachmentHost): RequestSyncExchange {
  const context: RequestSyncExchange['context'] = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    initiatorDeviceId: local.id, initiatorLibraryEpoch: local.epoch,
    responderDeviceId: remote.id, responderLibraryEpoch: remote.epoch };
  const groupKey = new Uint8Array(32).fill(7);
  return { context, groupKey, request: (_path, stream, consume) =>
    respondRequestSyncAttachments(host, { context, groupKey, stream }, response => consume({
      preamble: response.preamble, frames: (async function* () {
        for await (const frame of response.frames) yield { ...frame, header: decodeFrameHeader(frame.headerBytes) };
      })()
    })) };
}

it('persists demand through data-only relay, source absence and reopening, then fills both receivers from the returning source', async () => {
  const fixture = await restoreFixture();
  const a = fixture.peer('source'); const b = fixture.peer('target'); const c = fixture.peer('observer');
  const owners = await Promise.all([a, b, c].map(attachments));
  const [aa, bb, cc] = owners;
  if (!aa || !bb || !cc) throw new Error('test_owners_missing');
  const bytes = Buffer.from('Original resource bytes');
  const key = `${createHash('sha256').update(bytes).digest('hex')}.png`;
  try {
    await applyConvergentSyncNodesWithDbPort(a.db, [textBranch('v1', `![image](asset://${key})`)]);
    await writeFile(path.join(aa.assetsDir, key), bytes);
    await content(a, b); // Stop after the data round, before any attachment reaches B.
    expect(b.sqlite.prepare('SELECT article_id FROM attachment_parse_queue').pluck().all()).toContain('topic');
    b.reopen();
    await content(b, c);
    const errors: unknown[] = [];
    await exchangeRequestSyncAttachments(cc.host, exchange(c, b, bb.host), (_key, error) => errors.push(error));
    expect(errors.length).toBeGreaterThan(0);
    for (const peer of [b, c]) expect(peer.sqlite.prepare('SELECT storage_key FROM attachment_pending').pluck().all()).toEqual([key]);
    for (const [peer, files] of [[b, bb], [c, cc]] as const) {
      const result = await exchangeRequestSyncAttachments(files.host, exchange(peer, a, aa.host), (_key, error) => { throw error; });
      expect(result.pending).toBe(0);
      expect(await readFile(path.join(files.assetsDir, key))).toEqual(bytes);
      expect(peer.sqlite.prepare('SELECT * FROM attachment_parse_queue').all()).toEqual([]);
      expect(peer.sqlite.prepare('SELECT * FROM attachment_pending').all()).toEqual([]);
    }
  } finally { for (const owner of owners) await owner.close(); await fixture.close(); }
});

it('derives demand from the merged adopted row and excludes the received alternative', async () => {
  const fixture = await restoreFixture(); const peer = fixture.peer('source');
  const files = await attachments(peer);
  const key = (letter: string) => `${letter.repeat(64)}.png`;
  try {
    const base = textBranch('base', 'First\n\nMiddle\n\nLast');
    const local = textBranch('local', `![local](asset://${key('a')})\n\n![retained](asset://${key('c')})\n\nLast`, base);
    const remote = textBranch('remote', `First\n\nMiddle\n\n![remote](asset://${key('b')})`, base);
    await applyConvergentSyncNodesWithDbPort(peer.db, [base, local]);
    await files.host.needsSlice(() => false);
    await applyConvergentSyncNodesWithDbPort(peer.db, [remote]);
    const body = peer.sqlite.prepare("SELECT content FROM nodes WHERE id = 'topic'").pluck().get();
    expect(body).toContain(key('a')); expect(body).toContain(key('c'));
    expect(body).not.toContain(key('b'));
    expect(peer.sqlite.prepare("SELECT current_version_id FROM nodes WHERE id = 'topic'").pluck().get()).toMatch(/^ver_/);
    expect(new Set((await files.host.needsSlice(() => false)).keys)).toEqual(new Set([key('a'), key('c')]));
  } finally { await files.close(); await fixture.close(); }
});

it('downloads old backlog alongside continuous new content even when each round permits only one file', async () => {
  const fixture = await restoreFixture(); const a = fixture.peer('source'); const b = fixture.peer('target');
  const aa = await attachments(a); const bb = await attachments(b);
  const bytes = (i: number) => Buffer.from(`Resource ${i}`);
  const key = (i: number) => `${createHash('sha256').update(bytes(i)).digest('hex')}.png`;
  try {
    for (let i = 0; i < 20; i++) await writeFile(path.join(aa.assetsDir, key(i)), bytes(i));
    await applyConvergentSyncNodesWithDbPort(b.db, [textBranch('old',
      Array.from({ length: 10 }, (_, i) => `![old](asset://${key(i)})`).join('\n'))]);
    await bb.host.needsSlice(() => false);
    await b.db.run("UPDATE attachment_pending SET attempted_at = '2000'");
    for (let round = 0; round < 6; round++) {
      const record = textBranch(`fresh-${round}`, `![new](asset://${key(10 + round)})`);
      record.object_id = `fresh-${round}`; record.snapshot.id = record.object_id;
      await applyConvergentSyncNodesWithDbPort(b.db, [record]);
      const result = await exchangeRequestSyncAttachments(bb.host, exchange(b, a, aa.host), (_key, error) => { throw error; }, () => true);
      expect(result.blocks).toBe(1);
    }
    const oldFiles = await Promise.all(Array.from({ length: 10 }, (_, i) => isDesktopAttachmentPresent(bb.assetsDir, key(i))));
    const newFiles = await Promise.all(Array.from({ length: 6 }, (_, i) => isDesktopAttachmentPresent(bb.assetsDir, key(10 + i))));
    expect(oldFiles.filter(Boolean).length).toBeGreaterThanOrEqual(3);
    expect(newFiles.filter(Boolean).length).toBeGreaterThanOrEqual(3);
  } finally { await aa.close(); await bb.close(); await fixture.close(); }
});

function applyBodyRequest(source: RestorePeer, target: RestorePeer, request: RequestSyncFiles) {
  return applyRequestSyncObject(target.db, {
    context: { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
      senderDeviceId: source.id, senderLibraryEpoch: source.epoch,
      receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch },
    peerState: { contract_version: 3, group_id: 'group', sender_device_identity_key: source.id,
      library_epoch: source.epoch, proof_revision: 0, source_proof_revisions: {}, devices: [], removals: [], restore: null },
    objectType: 'node', globalId: 'topic', requestId: new Uint8Array(16), enqueueSearchInvalidations: false,
    facts: () => request.readFacts(), loadBody: (_db, blob) => request.loadBody(blob)
  });
}

it('rejects a request with missing body bytes, then retries the same version and downloads its attachment', async () => {
  const fixture = await restoreFixture(); const a = fixture.peer('source'); const b = fixture.peer('target');
  const aa = await attachments(a); const bb = await attachments(b);
  const bytes = Buffer.from('Body retry attachment');
  const key = `${createHash('sha256').update(bytes).digest('hex')}.png`;
  const body = `![image](asset://${key})`;
  try {
    await applyConvergentSyncNodesWithDbPort(a.db, [textBranch('body-retry', body)]);
    await writeFile(path.join(aa.assetsDir, key), bytes);
    const difference = compareFramedSyncInventories({ local: await readRequestSyncInventorySnapshot(a.db), remote: [] })
      .find(item => item.objectType === 'node' && item.globalId === 'topic');
    if (!difference) throw new Error('test_node_difference_missing');
    await withRequestSyncFiles(a.host.files, complete => withRequestSyncFiles(b.host.files, async incomplete => {
      await writeRequestSyncSnapshot(a.db, difference, complete);
      for await (const fact of complete.readFacts()) await incomplete.writeFact(fact);
      await expect(applyBodyRequest(a, b, incomplete)).rejects.toThrow('request_sync_body_chunk_missing');
      expect(b.sqlite.prepare("SELECT id FROM nodes WHERE id = 'topic'").all()).toEqual([]);
      expect(b.sqlite.prepare('SELECT * FROM node_sync_versions').all()).toEqual([]);
      expect(b.sqlite.prepare('SELECT * FROM attachment_parse_queue').all()).toEqual([]);
      for await (const fact of complete.readFacts()) {
        for (const blob of fact.blobs) await incomplete.writeBody(blob, await complete.loadBody(blob));
      }
      await applyBodyRequest(a, b, incomplete);
    }));
    b.reopen();
    expect(b.sqlite.prepare("SELECT content FROM nodes WHERE id = 'topic'").pluck().get()).toBe(body);
    expect((await bb.host.needsSlice(() => false)).keys).toEqual([key]);
    await exchangeRequestSyncAttachments(bb.host, exchange(b, a, aa.host), (_key, error) => { throw error; });
    expect(await readFile(path.join(bb.assetsDir, key))).toEqual(bytes);
    expect(b.sqlite.prepare('SELECT * FROM attachment_pending').all()).toEqual([]);
  } finally { await aa.close(); await bb.close(); await fixture.close(); }
});

it('restores an empty clean current projection when its complete object is received again', async () => {
  const fixture = await restoreFixture(); const a = fixture.peer('source'); const b = fixture.peer('target');
  const bb = await attachments(b);
  const key = `${'d'.repeat(64)}.png`; const body = `![image](asset://${key})`;
  try {
    await applyConvergentSyncNodesWithDbPort(a.db, [textBranch('original', body)]);
    await content(a, b);
    expect(() => b.sqlite.exec("UPDATE nodes SET content = NULL WHERE id = 'topic'")).toThrow('NOT NULL');
    b.sqlite.exec("UPDATE nodes SET content = '' WHERE id = 'topic'");
    await bb.host.needsSlice(() => false);
    const difference = compareFramedSyncInventories({ local: await readRequestSyncInventorySnapshot(a.db), remote: [] })
      .find(item => item.objectType === 'node' && item.globalId === 'topic');
    if (!difference) throw new Error('test_node_difference_missing');
    await transfer(a, b, { groupId: 'group', overwriteId: 'ordinary', providerDeviceId: a.id,
      providerLibraryEpoch: a.epoch, receiverDeviceId: b.id, receiverLibraryEpoch: b.epoch }, difference, false);
    b.reopen();
    expect(b.sqlite.prepare("SELECT content, current_version_id FROM nodes WHERE id = 'topic'").get())
      .toEqual({ content: body, current_version_id: 'original' });
    expect((await bb.host.needsSlice(() => false)).keys).toEqual([key]);
    expect(b.sqlite.prepare('SELECT * FROM attachment_parse_queue').all()).toEqual([]);
  } finally { await bb.close(); await fixture.close(); }
});
