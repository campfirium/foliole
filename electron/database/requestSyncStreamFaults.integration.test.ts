// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

import { FRAMED_SYNC_LIMITS, FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { applyFramedFactSources } from '../../lib/core/sync/framedSyncFactApply.js';
import { projectFramedSyncNodeRecord } from '../../lib/core/sync/framedSyncNodeProjection.js';
import { withRequestSyncFiles, type RequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { requestSyncObjectMessages, type RequestSyncMessage } from '../../lib/core/sync/requestSyncObjectMessages.js';
import { receiveRequestSyncObjectMessages } from '../../lib/core/sync/requestSyncObjectReceiver.js';
import { prepareRequestSyncWire, readRequestSyncWire, type RequestSyncAuthenticatedContext, type RequestSyncWireFrame } from '../../lib/core/sync/requestSyncWire.js';
import { createDesktopFramedSyncFiles } from '../sync/desktopFramedSyncFiles.js';

import { textBranch, textDevice } from './topicTextState.testSupport.js';

type Fault = 'truncated' | 'missing-body' | 'corrupt-body' | 'duplicate-fact' | 'cyclic-parent' |
  'wrong-peer' | 'wrong-protocol' | 'corrupt-ciphertext' | 'missing-frame' |
  'utf8-truncated' | 'utf8-bad-continuation' | 'body-gap' | 'body-oversized' |
  'body-overlap' | 'empty-body-extra' | 'body-end-extra';
const context: RequestSyncAuthenticatedContext = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
  initiatorDeviceId: 'source', initiatorLibraryEpoch: 'source-epoch',
  responderDeviceId: 'target', responderLibraryEpoch: 'target-epoch' };
const groupKey = new Uint8Array(32).fill(9);
const errors: Record<Fault, string | typeof TypeError> = {
  truncated: 'request_sync_object_incomplete', 'missing-body': 'request_sync_object_incomplete',
  'corrupt-body': 'request_sync_body_identity_mismatch', 'duplicate-fact': 'request_sync_body_incomplete',
  'cyclic-parent': 'node_version_graph_cycle', 'wrong-peer': 'session_context_mismatch',
  'wrong-protocol': 'framed_sync_protocol_version_unsupported',
  'corrupt-ciphertext': 'frame_authentication_failed', 'missing-frame': 'frame_sequence_not_contiguous',
  'utf8-truncated': TypeError, 'utf8-bad-continuation': TypeError,
  'body-gap': 'request_sync_body_chunk_invalid', 'body-oversized': 'request_sync_body_chunk_invalid',
  'body-overlap': 'request_sync_body_chunk_invalid', 'empty-body-extra': 'request_sync_body_chunk_invalid',
  'body-end-extra': 'request_sync_body_chunk_invalid'
};

it.each<Fault>(['truncated', 'missing-body', 'corrupt-body', 'duplicate-fact', 'cyclic-parent',
  'wrong-peer', 'wrong-protocol', 'corrupt-ciphertext', 'missing-frame', 'utf8-truncated',
  'utf8-bad-continuation', 'body-gap', 'body-oversized', 'body-overlap', 'empty-body-extra', 'body-end-extra'])('rejects %s without applying an object and removes its request files', async fault => {
  await mkdir('.tmp/artifacts', { recursive: true });
  const root = await mkdtemp(path.resolve('.tmp/artifacts/request-sync-fault-'));
  const files = createDesktopFramedSyncFiles(root);
  const target = textDevice();
  let received = false;
  try {
    await expect(withRequestSyncFiles(files, async outgoing => {
      const header = await seed(outgoing, fault);
      const wire = await prepareRequestSyncWire({ context, groupKey,
        messages: id => mutateMessages(requestSyncObjectMessages(header, id, outgoing), fault, id) });
      const preamble = wire.preamble.slice();
      if (fault === 'wrong-protocol') new DataView(preamble.buffer, preamble.byteOffset, preamble.byteLength).setUint16(10, 21);
      await withRequestSyncFiles(files, async incoming => {
        const messages = readRequestSyncWire({ context: fault === 'wrong-peer' ?
          { ...context, responderDeviceId: 'another-device' } : context, groupKey, preamble,
        frames: mutateFrames(wire.frames, fault) });
        await receiveRequestSyncObjectMessages(messages, wire.contextId, incoming);
        received = true;
        await applyFramedFactSources(target.db, [async function* () { yield* incoming.readFacts(); }], {
          requireCompleteVersionGraph: true, loadBody: (_db, blob) => incoming.loadBody(blob)
        });
      });
    })).rejects.toThrow(errors[fault]);
    if (fault.startsWith('utf8-')) expect(received).toBe(true);
    expect(await target.db.query('SELECT id FROM nodes')).toEqual([]);
    expect(await target.db.query('SELECT version_id FROM node_sync_versions')).toEqual([]);
    expect((await readdir(root)).filter(name => name !== 'requests')).toEqual([]);
    expect(await files.list('requests')).toEqual([]);
  } finally {
    target.sqlite.close();
    await rm(root, { recursive: true });
  }
});

async function seed(files: RequestSyncFiles, fault: Fault) {
  // A reclaimed parent is a valid gap; a version naming itself as parent is a broken graph.
  const parent = fault === 'cyclic-parent' ? textBranch('head', 'Parent') : undefined;
  const text = fault.startsWith('utf8-') ? 'x'.repeat(16 * 1024 - 1) + '😀' :
    fault === 'empty-body-extra' ? '' : fault === 'body-overlap' ? 'x'.repeat(FRAMED_SYNC_LIMITS.blobChunkBytes + 4) : 'Body';
  const projection = projectFramedSyncNodeRecord(textBranch('head', text, parent));
  let fact = projection.manifest.facts[0]!;
  let body = projection.bodyBlob;
  if (fault.startsWith('utf8-')) {
    body = fault === 'utf8-truncated' ? body.slice(0, -1) : body.slice();
    if (fault === 'utf8-bad-continuation') body[16 * 1024] = 0x41;
    const hash = new Uint8Array(createHash('sha256').update(body).digest());
    fact = { ...fact, blobs: fact.blobs.map(blob => ({ ...blob, byteLength: BigInt(body.length), sha256: hash })),
      body: fact.body.map(field => field.name === 'snapshot' && field.value.kind === 'object'
        ? { ...field, value: { ...field.value, value: field.value.value.map(value => value.name === 'body_blob_hash'
          ? { ...value, value: { kind: 'string' as const, value: Buffer.from(hash).toString('hex') } } : value) } } : field) };
  }
  for (const blob of fact.blobs) await files.writeBody(blob, body);
  await files.writeFact(fact);
  return { requestId: new Uint8Array(16).fill(2), objectType: 'node', globalId: 'topic',
    currentVersionId: fact.factId, sourceStateHash: fact.sharedStateHash };
}

async function* mutateMessages(
  messages: AsyncIterable<RequestSyncMessage>, fault: Fault, contextId: Uint8Array
): AsyncGenerator<RequestSyncMessage> {
  for await (const message of messages) {
    if (fault === 'truncated' && message.payloadCase === 'request_object_end') continue;
    if (fault === 'missing-body' && message.payloadCase === 'blob_chunk') continue;
    if (fault === 'corrupt-body' && message.payloadCase === 'blob_chunk') {
      const payload = message.payload as { data: Uint8Array };
      const data = payload.data.slice(); data[0] = (data[0] ?? 0) ^ 1;
      yield { ...message, payload: { ...payload, data } };
    } else if (message.payloadCase === 'blob_chunk') {
      const payload = message.payload as { data: Uint8Array; offset: number | string };
      if (fault === 'body-gap') yield { ...message, payload: { ...payload, offset: 1 } };
      else if (fault === 'body-oversized') yield { ...message,
        payload: { ...payload, data: Uint8Array.from([...payload.data, 1]) } };
      else {
        yield message;
        if (fault === 'body-overlap' && Number(payload.offset) === 0) yield message;
        if (fault === 'body-end-extra') yield { ...message,
          payload: { ...payload, offset: payload.data.length, data: Uint8Array.of(1) } };
      }
    } else yield message;
    if (fault === 'empty-body-extra' && message.payloadCase === 'fact') yield {
      payloadCase: 'blob_chunk', payload: { transferId: contextId,
        blobHash: new Uint8Array(createHash('sha256').update(new Uint8Array()).digest()), offset: 0, data: Uint8Array.of(1) }
    };
    if (fault === 'duplicate-fact' && message.payloadCase === 'fact') yield message;
  }
}

async function* mutateFrames(frames: AsyncIterable<RequestSyncWireFrame>, fault: Fault) {
  let index = 0;
  for await (const frame of frames) {
    index++;
    if (fault === 'missing-frame' && index === 2) continue;
    if (fault === 'corrupt-ciphertext' && index === 2) {
      const ciphertext = frame.ciphertext.slice(); ciphertext[0] = (ciphertext[0] ?? 0) ^ 1;
      yield { ...frame, ciphertext };
    } else yield frame;
  }
}
