// @vitest-environment node
import { expect, it } from 'vitest';

import { FRAMED_SYNC_PROTOCOL_VERSION } from './framedSyncContract.js';
import { withRequestSyncFiles } from './requestSyncFiles.js';
import { requestSyncObjectMessages } from './requestSyncObjectMessages.js';
import { receiveRequestSyncObjectMessages } from './requestSyncObjectReceiver.js';
import { prepareRequestSyncWire, readRequestSyncWire, type RequestSyncAuthenticatedContext } from './requestSyncWire.js';

it('sends the same header bytes that were accounted when a borrowed source buffer changes', async () => {
  const files = { read: async () => null, write: async () => undefined, remove: async () => undefined };
  const context = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    initiatorDeviceId: 'a', initiatorLibraryEpoch: 'a-epoch', responderDeviceId: 'b', responderLibraryEpoch: 'b-epoch' } satisfies RequestSyncAuthenticatedContext;
  const groupKey = new Uint8Array(32).fill(7);
  await withRequestSyncFiles(files, async source => {
    await source.writeFact({ factId: 'fact', globalId: 'node', objectType: 'node', kind: 2,
      sharedStateHash: new Uint8Array(32), body: [], blobs: [] });
    const header = { requestId: new Uint8Array(16), objectType: 'node', globalId: 'node', sourceStateHash: new Uint8Array(32) };
    const wire = await prepareRequestSyncWire({ context, groupKey, messages: async function* (contextId) {
      const messages = requestSyncObjectMessages(header, contextId, source);
      const first = await messages.next();
      if (first.done) throw new Error('object_header_missing');
      header.sourceStateHash.fill(9);
      yield first.value;
      yield* messages;
    } });
    await withRequestSyncFiles(files, async target => {
      const received = await receiveRequestSyncObjectMessages(readRequestSyncWire({ context, groupKey, ...wire }), wire.contextId, target);
      expect(received.sourceStateHash).toEqual(new Uint8Array(32));
      const facts = [];
      for await (const fact of target.readFacts()) facts.push(fact.factId);
      expect(facts).toEqual(['fact']);
    });
  });
});
