// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import { readFramedSyncStream } from '../../lib/core/sync/framedSyncBinaryStream.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { applyFramedFactSources } from '../../lib/core/sync/framedSyncFactApply.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';
import { REQUEST_SYNC_MEMORY_BYTES, withRequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { requestSyncObjectMessages } from '../../lib/core/sync/requestSyncObjectMessages.js';
import { receiveRequestSyncObjectMessages } from '../../lib/core/sync/requestSyncObjectReceiver.js';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot.js';
import { prepareRequestSyncWire, readRequestSyncWire, type RequestSyncAuthenticatedContext } from '../../lib/core/sync/requestSyncWire.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
import { createDesktopFramedSyncFiles } from '../sync/desktopFramedSyncFiles.js';
import { encodeFramedSyncHttpBody } from '../sync/desktopFramedSyncHttpWriter.js';
import { prepareDesktopRequestSyncBody } from '../sync/desktopRequestSyncBody.js';

import { textBranch, textDevice } from './topicTextState.testSupport.js';

const context: RequestSyncAuthenticatedContext = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
  initiatorDeviceId: 'source', initiatorLibraryEpoch: 'source-epoch',
  responderDeviceId: 'target', responderLibraryEpoch: 'target-epoch' };
const groupKey = new Uint8Array(32).fill(7);

it.each([1, 6])('keeps an independent prepared request intact after source closure and another reader release (%i versions)', async count => {
  const source = textDevice(); const target = textDevice();
  const root = await mkdtemp(path.join(os.tmpdir(), 'request-prepared-body-'));
  const files = createDesktopFramedSyncFiles(root);
  const bodies: Awaited<ReturnType<typeof prepareDesktopRequestSyncBody>>[] = [];
  let sourceClosed = false;
  try {
    const records = [textBranch('version-0', 'Original正文'.repeat(count === 1 ? 10 : 65_000))];
    for (let index = 1; index < count; index++) records.push(textBranch(`version-${index}`,
      `${index}正文`.repeat(120_000), records.at(-1)));
    // Freeze a complete pending batch before its unused live copies are collected.
    await applyConvergentSyncNodesWithDbPort(source.db, records, { collectVersionPayloads: false });
    const expectedVersions = await source.db.query('SELECT version_id, parent_version_id, content_hash, body_text FROM node_sync_versions ORDER BY version_id');
    const expectedParents = await source.db.query('SELECT * FROM node_sync_version_parents ORDER BY version_id, parent_version_id');
    const entry = await readFramedSyncInventoryEntry(source.db, { objectType: 'node', globalId: 'topic' });
    if (!entry) throw new Error('inventory_missing');
    const [difference] = compareFramedSyncInventories({ local: [entry], remote: [] });
    if (!difference) throw new Error('difference_missing');
    const header = { requestId: new Uint8Array(16).fill(1), objectType: 'node', globalId: 'topic', sourceStateHash: entry.sharedStateHash };
    const prepared = await withRequestSyncFiles(files, async request => {
      await writeRequestSyncSnapshot(source.db, difference, request);
      return Promise.all([0, 1].map(async () => {
        const wire = await prepareRequestSyncWire({ context, groupKey,
          messages: contextId => requestSyncObjectMessages(header, contextId, request) });
        const body = await prepareDesktopRequestSyncBody(wire);
        bodies.push(body);
        return { body, contextId: wire.contextId };
      }));
    });
    expect(await files.list('requests')).toEqual([]);
    expect(prepared[0]!.body.bodySha256).not.toBe(prepared[1]!.body.bodySha256);
    await prepared[0]!.body.dispose?.();
    expect(await collectNodeVersionPayloads(source.db, 'topic')).toEqual({ released: count - 1, skipped: null });
    expect(source.sqlite.prepare('SELECT count(*) FROM node_sync_versions WHERE body_text IS NOT NULL').pluck().get()).toBe(1);
    source.sqlite.close(); sourceClosed = true;
    const remaining = prepared[1]!;
    expect(remaining.body.contentLength > REQUEST_SYNC_MEMORY_BYTES).toBe(count === 6);
    const chunks: Uint8Array[] = [];
    for await (const chunk of encodeFramedSyncHttpBody(remaining.body)) chunks.push(Uint8Array.from(chunk));
    const bytes = Buffer.concat(chunks);
    expect(bytes.length).toBe(remaining.body.contentLength);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(remaining.body.bodySha256);
    const stream = await readFramedSyncStream((async function* () { yield bytes; })());
    await withRequestSyncFiles(files, async received => {
      const decoded = readRequestSyncWire({ context, groupKey, ...stream });
      expect(await receiveRequestSyncObjectMessages(decoded, remaining.contextId, received)).toEqual(header);
      await applyFramedFactSources(target.db, [() => received.readFacts()], {
        requireCompleteVersionGraph: true, loadBody: (_db, blob) => received.loadBody(blob)
      });
    });
    expect(await target.db.query('SELECT version_id, parent_version_id, content_hash, body_text FROM node_sync_versions ORDER BY version_id')).toEqual(expectedVersions);
    expect(await target.db.query('SELECT * FROM node_sync_version_parents ORDER BY version_id, parent_version_id')).toEqual(expectedParents);
    expect((await target.current()).body_text).toBe(records.at(-1)!.body_text);
  } finally {
    await Promise.all(bodies.map(body => body.dispose?.()));
    if (!sourceClosed) source.sqlite.close();
    target.sqlite.close();
    await rm(root, { recursive: true, force: true });
  }
});
