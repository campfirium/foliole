import type { AttachmentBlockDestination, AttachmentBlockSource } from './attachmentBlockTransfer.js';
import type { FramedSyncFilePort } from './framedSyncFilePort.js';
import type { RequestSyncDatabaseHost } from './requestSyncObjectEndpoint.js';
import { enqueueWebDavRelayAttachments, publishWebDavRelayAttachments, resumeWebDavRelayAttachment } from './webDavRelayAttachments.js';
import { freezeWebDavRelayBodyPacket, readWebDavRelayBodyOutbox, webDavRelayPacketBytes,
  webDavRelayPacketDirectory, writeWebDavRelayBodyOutbox } from './webDavRelayBodyOutbox.js';
import { receiveWebDavRelayBodyPackets } from './webDavRelayBodyReceive.js';
import type { WebDavRelayBodyScope } from './webDavRelayBodyScope.js';
import { ensureWebDavCollection } from './webDavRelayCollections.js';
import { publishWebDavRelayFile, type WebDavRelayRequest } from './webDavRelayPublication.js';

type Input = {
  host: RequestSyncDatabaseHost;
  attachments?: AttachmentBlockSource & AttachmentBlockDestination;
  files: FramedSyncFilePort;
  request: WebDavRelayRequest;
  scope: WebDavRelayBodyScope;
  groupKey: Uint8Array;
  signal?: AbortSignal;
  lanConnected(): boolean;
  assertScope(): Promise<void>;
  progress: { published: number; applied: number; retries: number };
};

export function runWebDavRelayBodyRound(input: Input) {
  return input.files.exclusive(webDavRelayPacketDirectory(input.scope), async () => {
    input.signal?.throwIfAborted();
    await input.assertScope();
    await receiveWebDavRelayBodyPackets({ ...input, applied: count => { input.progress.applied += count; },
      retry: count => { input.progress.retries += count; } });
    const attachments = input.attachments && { ...input, attachments: input.attachments };
    if (attachments && !await resumeWebDavRelayAttachment(attachments)) return input.progress;
    const slotFree = await publishChanges(input);
    if (slotFree && attachments) await publishWebDavRelayAttachments(attachments);
    return input.progress;
  });
}

async function publishChanges(input: Input) {
  const { host, scope, files, signal, request } = input;
  const upper = await host.readSnapshot(async db => {
    const [position] = await db.query<{ high_water: number }>('SELECT high_water FROM sync_state_sequence WHERE singleton_id = 1');
    if (!position) throw new Error('webdav_relay_source_position_missing');
    return position.high_water;
  }, signal);
  let collectionReady = false;
  for (;;) {
    signal?.throwIfAborted();
    if (input.lanConnected()) return;
    await input.assertScope();
    const state = await host.readSnapshot(db => readWebDavRelayBodyOutbox(db, scope), signal);
    const packet = state.packet ?? await freezeWebDavRelayBodyPacket({ ...input, sequence: state.sequence, upper, includeAttachments: Boolean(input.attachments) });
    if (!packet) return true;
    if (!state.packet) await host.write(db => writeWebDavRelayBodyOutbox(db, scope, { sequence: state.sequence, packet }));
    if (input.lanConnected()) return;
    if (!collectionReady) {
      await ensureWebDavCollection(request, scope.outgoing);
      collectionReady = true;
    }
    await input.assertScope();
    if (input.lanConnected()) return;
    if (state.packet) input.progress.retries++;
    await publishWebDavRelayFile(request, new URL(packet.name, scope.outgoing), webDavRelayPacketBytes(files, scope, packet));
    await host.write(db => db.transaction(async tx => {
      await writeWebDavRelayBodyOutbox(tx, scope, { sequence: packet.through, packet: null });
      await enqueueWebDavRelayAttachments(tx, scope, packet.attachments ?? []);
    }));
    input.progress.published++;
    await files.remove(webDavRelayPacketDirectory(scope));
  }
}
