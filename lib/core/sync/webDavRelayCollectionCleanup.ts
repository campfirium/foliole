import { ATTACHMENT_BLOCK_BYTES } from './attachmentBlockReceiver.js';
import type { AttachmentBlockSource } from './attachmentBlockTransfer.js';
import type { DbPort } from './dbPort.js';
import type { FramedSyncFilePort } from './framedSyncFilePort.js';
import type { RequestSyncDatabaseHost } from './requestSyncObjectEndpoint.js';
import type { RequestSyncAuthenticatedContext } from './requestSyncWire.js';
import { webDavRelayAttachmentOutboxKey } from './webDavRelayAttachments.js';
import { readWebDavRelayBodyOutbox, webDavRelayPacketDirectory } from './webDavRelayBodyOutbox.js';
import type { WebDavRelayBodyScope } from './webDavRelayBodyScope.js';
import { ensureWebDavCollection, readRelayCollections, relayCollectionOffer, relayCollectionUrl, relayGenerationRoot,
  writeRelayCollections, type RelayCollectionOffer } from './webDavRelayCollections.js';
import { webDavRelayStatus, type WebDavRelayRequest } from './webDavRelayPublication.js';

type Runtime = {
  host: RequestSyncDatabaseHost;
  files: FramedSyncFilePort;
  request: WebDavRelayRequest;
  attachments: AttachmentBlockSource;
  loadScope(db: DbPort): Promise<WebDavRelayBodyScope | null>;
  signal: AbortSignal;
};
type Candidate = { offer: RelayCollectionOffer; sequence: number; retired: boolean };

export async function captureWebDavRelayCleanup(input: Runtime, context: RequestSyncAuthenticatedContext,
  role: 'initiator' | 'responder') {
  const scope = await input.host.readSnapshot(input.loadScope, input.signal);
  const direction = role === 'initiator' ? scope?.send : scope?.receive;
  if (!scope || !direction || direction.groupId !== context.groupId ||
      direction.initiatorDeviceId !== context.initiatorDeviceId || direction.responderDeviceId !== context.responderDeviceId ||
      direction.initiatorLibraryEpoch !== context.initiatorLibraryEpoch ||
      direction.responderLibraryEpoch !== context.responderLibraryEpoch) return;
  const captured = await input.host.readSnapshot(db => readCandidate(db, scope), input.signal);
  const assertCurrent = async () => {
    input.signal.throwIfAborted();
    if ((await input.host.readSnapshot(input.loadScope, input.signal))?.key !== scope.key) {
      throw new Error('webdav_relay_scope_changed');
    }
  };
  return {
    offer: captured?.offer,
    async verify(offer: RelayCollectionOffer) {
      await assertCurrent();
      const covered = await hasFiles(input, offer);
      await assertCurrent();
      return covered;
    },
    async retire() {
      if (!captured) return;
      return input.files.exclusive(webDavRelayPacketDirectory(scope), async () => {
        await assertCurrent();
        const current = await input.host.readSnapshot(db => readCandidate(db, scope), input.signal);
        if (JSON.stringify(current) !== JSON.stringify(captured) || !await hasFiles(input, captured.offer)) return;
        await assertCurrent();
        if (!captured.retired) await retireCollection(input, scope, captured);
        return captured.offer;
      });
    },
    async delete(offer: RelayCollectionOffer, direction: 'incoming' | 'outgoing') {
      await assertCurrent();
      if (!await hasFiles(input, offer)) return;
      await assertCurrent();
      const target = direction === 'incoming' ? scope.incoming : scope.outgoingDirection;
      const status = await input.request(relayCollectionUrl(target, offer.generation), { method: 'DELETE' }, webDavRelayStatus);
      if (status !== 204 && status !== 404) throw new Error(`webdav_relay_cleanup_failed:${status}`);
    },
    async forgetDeleted() {
      if (!captured?.retired) return;
      await assertCurrent();
      const url = relayCollectionUrl(scope.outgoingDirection, captured.offer.generation);
      if (await input.request(url, { method: 'PROPFIND', headers: { Depth: '0' } }, webDavRelayStatus) !== 404) return;
      await input.host.write(async db => {
        const state = await readRelayCollections(db, scope.key);
        if (state?.retired?.generation === captured.offer.generation) {
          await writeRelayCollections(db, scope.key, { ...state, retired: null });
        }
      });
    }
  };
}

async function readCandidate(db: DbPort, scope: WebDavRelayBodyScope): Promise<Candidate | undefined> {
  const state = await readRelayCollections(db, scope.key);
  const outbox = await readWebDavRelayBodyOutbox(db, scope);
  if (state?.retired) return { offer: state.retired, sequence: state.startSequence, retired: true };
  if (outbox.packet || (await db.query('SELECT 1 FROM sync_group_metadata WHERE key = ?',
    [webDavRelayAttachmentOutboxKey(scope)])).length) return;
  if (outbox.sequence <= (state?.startSequence ?? scope.baseline.sequence) && !state?.keys.length) return;
  const prefix = `${scope.key}:attachment:`;
  const keys = state?.keys ?? (await db.query<{ key: string }>(`SELECT key FROM sync_group_metadata
    WHERE key >= ? AND key < ? AND value = 'done' ORDER BY key`, [prefix, `${scope.key}:attachment;`]))
    .map(row => row.key.slice(prefix.length));
  return { offer: relayCollectionOffer.parse({ generation: state?.active ?? 'legacy', keys }), sequence: outbox.sequence, retired: false };
}

async function retireCollection(input: Runtime, scope: WebDavRelayBodyScope, candidate: Candidate) {
  const active = crypto.randomUUID();
  const direction = scope.outgoingDirection;
  await ensureWebDavCollection(input.request, relayGenerationRoot(direction));
  await ensureWebDavCollection(input.request, relayCollectionUrl(direction, active));
  await input.host.write(async db => {
    input.signal.throwIfAborted();
    if ((await input.loadScope(db))?.key !== scope.key) throw new Error('webdav_relay_scope_changed');
    await writeRelayCollections(db, scope.key, { active, startSequence: candidate.sequence, keys: [], retired: candidate.offer });
  });
}

async function hasFiles(input: Runtime, offer: RelayCollectionOffer) {
  for (const key of offer.keys) {
    input.signal.throwIfAborted();
    try {
      await input.attachments.withFile(key, async file => {
        for (let offset = 0; offset < file.resource.byteLength; offset += ATTACHMENT_BLOCK_BYTES) {
          input.signal.throwIfAborted();
          await file.read(offset, Math.min(ATTACHMENT_BLOCK_BYTES, file.resource.byteLength - offset));
        }
      }, { shouldYield: () => input.signal.aborted });
    }
    catch { input.signal.throwIfAborted(); return false; }
  }
  return true;
}

export type WebDavRelayCleanup = NonNullable<Awaited<ReturnType<typeof captureWebDavRelayCleanup>>>;

export function createWebDavRelayInboundCleanup() {
  const rounds = new WeakMap<AbortSignal, Promise<WebDavRelayCleanup | undefined>>();
  return {
    async capture(round: AbortSignal, capture: () => Promise<WebDavRelayCleanup | undefined>) {
      if (!rounds.has(round)) rounds.set(round, tryCaptureWebDavRelayCleanup(capture));
      await rounds.get(round);
    },
    read(round: AbortSignal) { return rounds.get(round); }
  };
}

export async function tryCaptureWebDavRelayCleanup(capture: () => Promise<WebDavRelayCleanup | undefined>) {
  try { return await capture(); }
  catch (error) { console.warn('[sync] WebDAV collection cleanup deferred', error); }
}
