import type { FramedSyncFilePort } from './framedSyncFilePort.js';
import type { RequestSyncAttachmentHost } from './requestSyncAttachmentResponse.js';
import type { RequestSyncDatabaseHost } from './requestSyncObjectEndpoint.js';
import { WebDavAuthenticationError, withWebDavAuthenticationPause, type WebDavAuthenticationPause } from './webDavAuthenticationPause.js';
import { enqueueWebDavRelayAttachments, publishWebDavRelayAttachments, resumeWebDavRelayAttachment } from './webDavRelayAttachments.js';
import { freezeWebDavRelayBodyPacket, readWebDavRelayBodyOutbox, webDavRelayPacketBytes,
  webDavRelayPacketDirectory, writeWebDavRelayBodyOutbox } from './webDavRelayBodyOutbox.js';
import { receiveWebDavRelayBodyPackets } from './webDavRelayBodyReceive.js';
import type { WebDavRelayBodyScope } from './webDavRelayBodyScope.js';
import { ensureWebDavCollection } from './webDavRelayCollections.js';
import { publishWebDavRelayFile, type WebDavRelayRequest } from './webDavRelayPublication.js';
import { isWebDavRelayReceiveDue, recordWebDavRelayReceive } from './webDavRelayReceiveFreshness.js';
import { hasWebDavRelayRepairToSend, publishWebDavRelayRepair, refreshWebDavRelayRepair } from './webDavRelayRepairOutbox.js';
import { runWithWebDavRetryAfter } from './webDavRetryAfterStore.js';

type Input = {
  host: RequestSyncDatabaseHost;
  attachments?: RequestSyncAttachmentHost;
  files: FramedSyncFilePort;
  request: WebDavRelayRequest;
  authentication?: WebDavAuthenticationPause;
  scope: WebDavRelayBodyScope;
  groupKey: Uint8Array;
  signal?: AbortSignal;
  foregroundReceive?: boolean;
  lanConnected(): boolean;
  assertScope(): Promise<void>;
  progress: { published: number; applied: number; retries: number };
  requestSend?(): void;
};

export function runWebDavRelayBodyRound(input: Input) {
  return input.files.exclusive(webDavRelayPacketDirectory(input.scope), async () => {
    input.signal?.throwIfAborted();
    await input.assertScope();
    if (input.foregroundReceive && (input.lanConnected() || !await input.host.readSnapshot(
      db => isWebDavRelayReceiveDue(db, input.scope.receiveScope), input.signal))) return input.progress;
    return withWebDavAuthenticationPause(input.host, input.authentication, input.request, input.signal,
      request => runWithWebDavRetryAfter(input.host, input.scope.key, input.signal, () => exchange({ ...input, request })));
  });
}

async function exchange(input: Input) {
  const repairQueued = await receiveWebDavRelayBodyPackets({ ...input, applied: count => { input.progress.applied += count; },
    retry: count => { input.progress.retries += count; } });
  input.signal?.throwIfAborted();
  await input.assertScope();
  const attachments = input.attachments && { ...input, attachments: input.attachments };
  if (attachments) await refreshWebDavRelayRepair(attachments);
  const recordReceive = () => input.host.write(db => recordWebDavRelayReceive(db, input.scope.receiveScope));
  if (!input.authentication || input.foregroundReceive) await recordReceive();
  if (input.foregroundReceive) {
    if (repairQueued || await input.host.readSnapshot(db => hasWebDavRelayRepairToSend(db, input.scope), input.signal)) {
      input.requestSend?.();
    }
    return input.progress;
  }
  try { await publishPending(input, attachments); }
  catch (error) {
    if (input.authentication && !(error instanceof WebDavAuthenticationError)) await recordReceive();
    throw error;
  }
  if (input.authentication) await recordReceive();
  return input.progress;
}

async function publishPending(input: Input, attachments: (Input & { attachments: RequestSyncAttachmentHost }) | undefined) {
  if (attachments) {
    if (await publishWebDavRelayRepair(attachments)) input.progress.published++;
    if (await input.host.readSnapshot(db => hasWebDavRelayRepairToSend(db, input.scope), input.signal)) input.requestSend?.();
  }
  // Settle an existing publication before applying the policy to new attachment packets.
  if (attachments && !await resumeWebDavRelayAttachment(attachments)) return;
  const slotFree = await publishChanges(input);
  if (slotFree && attachments) await publishWebDavRelayAttachments(attachments);
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
