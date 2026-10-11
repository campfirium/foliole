// @vitest-environment node
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { applyFramedFactSources } from '../../lib/core/sync/framedSyncFactApply.js';
import { createFramedSyncFileSessionNoncePort } from '../../lib/core/sync/framedSyncFileSession.js';
import { projectFramedSyncNodeRecord } from '../../lib/core/sync/framedSyncNodeProjection.js';
import { withRequestSyncFiles, type RequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { requestSyncObjectMessages, type RequestSyncMessage } from '../../lib/core/sync/requestSyncObjectMessages.js';
import { receiveRequestSyncObjectMessages } from '../../lib/core/sync/requestSyncObjectReceiver.js';
import { prepareRequestSyncWire, readRequestSyncWire, type RequestSyncAuthenticatedContext, type RequestSyncWireFrame } from '../../lib/core/sync/requestSyncWire.js';
import { createDesktopFramedSyncFiles } from '../sync/desktopFramedSyncFiles.js';

import { textBranch, textDevice } from './topicTextState.testSupport.js';

type Fault = 'truncated' | 'missing-body' | 'corrupt-body' | 'duplicate-fact' | 'missing-parent' |
  'wrong-peer' | 'corrupt-ciphertext' | 'missing-frame';
const context: RequestSyncAuthenticatedContext = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
  initiatorDeviceId: 'source', initiatorLibraryEpoch: 'source-epoch',
  responderDeviceId: 'target', responderLibraryEpoch: 'target-epoch' };
const groupKey = new Uint8Array(32).fill(9);
const errors: Record<Fault, string> = {
  truncated: 'request_sync_object_incomplete', 'missing-body': 'request_sync_object_incomplete',
  'corrupt-body': 'request_sync_body_identity_mismatch', 'duplicate-fact': 'request_sync_body_incomplete',
  'missing-parent': 'node_version_missing_parents:missing', 'wrong-peer': 'session_context_mismatch',
  'corrupt-ciphertext': 'frame_authentication_failed', 'missing-frame': 'frame_sequence_not_contiguous'
};

it.each<Fault>(['truncated', 'missing-body', 'corrupt-body', 'duplicate-fact', 'missing-parent',
  'wrong-peer', 'corrupt-ciphertext', 'missing-frame'])('rejects %s without applying an object and removes its request files', async fault => {
  await mkdir('.tmp/artifacts', { recursive: true });
  const root = await mkdtemp(path.resolve('.tmp/artifacts/request-sync-fault-'));
  const files = createDesktopFramedSyncFiles(root);
  const target = textDevice();
  try {
    await expect(withRequestSyncFiles(files, async outgoing => {
      const header = await seed(outgoing, fault);
      const wire = await prepareRequestSyncWire({ context, groupKey, noncePort: createFramedSyncFileSessionNoncePort(files),
        messages: id => mutateMessages(requestSyncObjectMessages(header, id, outgoing), fault) });
      await withRequestSyncFiles(files, async incoming => {
        const messages = readRequestSyncWire({ context: fault === 'wrong-peer' ?
          { ...context, responderDeviceId: 'another-device' } : context, groupKey, preamble: wire.preamble,
        frames: mutateFrames(wire.frames, fault) });
        await receiveRequestSyncObjectMessages(messages, wire.contextId, incoming);
        await applyFramedFactSources(target.db, [async function* () { yield* incoming.readFacts(); }], {
          requireCompleteVersionGraph: true, loadBody: (_db, blob) => incoming.loadBody(blob)
        });
      });
    })).rejects.toThrow(errors[fault]);
    expect(await target.db.query('SELECT id FROM nodes')).toEqual([]);
    expect(await target.db.query('SELECT version_id FROM node_sync_versions')).toEqual([]);
    expect(await readdir(path.join(root, 'requests'))).toEqual([]);
  } finally {
    target.sqlite.close();
    await rm(root, { recursive: true });
  }
});

async function seed(files: RequestSyncFiles, fault: Fault) {
  const parent = fault === 'missing-parent' ? textBranch('missing', 'Parent') : undefined;
  const projection = projectFramedSyncNodeRecord(textBranch('head', 'Body', parent));
  const fact = projection.manifest.facts[0]!;
  for (const blob of fact.blobs) await files.writeBody(blob, projection.bodyBlob);
  await files.writeFact(fact);
  return { requestId: new Uint8Array(16).fill(2), objectType: 'node', globalId: 'topic',
    sourceStateHash: fact.sharedStateHash };
}

async function* mutateMessages(messages: AsyncIterable<RequestSyncMessage>, fault: Fault) {
  for await (const message of messages) {
    if (fault === 'truncated' && message.payloadCase === 'request_object_end') continue;
    if (fault === 'missing-body' && message.payloadCase === 'blob_chunk') continue;
    if (fault === 'corrupt-body' && message.payloadCase === 'blob_chunk') {
      const payload = message.payload as { data: Uint8Array };
      const data = payload.data.slice(); data[0] = (data[0] ?? 0) ^ 1;
      yield { ...message, payload: { ...payload, data } };
    } else yield message;
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
