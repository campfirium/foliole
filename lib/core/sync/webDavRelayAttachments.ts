import { attachmentBlockResourceSchema } from './attachmentBlockReceiver.js';
import type { AttachmentBlockSource } from './attachmentBlockTransfer.js';
import { AttachmentVerificationPending } from './attachmentSourceVerification.js';
import type { DbPort } from './dbPort.js';
import type { FramedSyncFilePort } from './framedSyncFilePort.js';
import type { RequestSyncDatabaseHost } from './requestSyncObjectEndpoint.js';
import { prepareWebDavAttachment, WEB_DAV_ATTACHMENT_SUFFIX } from './webDavRelayAttachmentWire.js';
import { stageWebDavRelayPacket, webDavRelayPacketBytes, webDavRelayPacketDirectory,
  webDavRelayPacketSchema } from './webDavRelayBodyOutbox.js';
import type { WebDavRelayBodyScope } from './webDavRelayBodyScope.js';
import { recordRelayCollectionAttachment } from './webDavRelayCollections.js';
import { publishWebDavRelayFile, type WebDavRelayRequest } from './webDavRelayPublication.js';

const pendingSchema = webDavRelayPacketSchema.pick({ name: true, chunks: true, bytes: true })
  .extend({ key: attachmentBlockResourceSchema.shape.storageKey });
type Pending = ReturnType<typeof pendingSchema.parse>;

type Input = {
  host: RequestSyncDatabaseHost;
  files: FramedSyncFilePort;
  scope: WebDavRelayBodyScope;
  request: WebDavRelayRequest;
  groupKey: Uint8Array;
  signal?: AbortSignal | undefined;
  attachments: AttachmentBlockSource;
  lanConnected(): boolean;
  assertScope(): Promise<void>;
  progress: { published: number; retries: number };
};

const prefix = (scope: WebDavRelayBodyScope) => `${scope.key}:attachment:`;
export const webDavRelayAttachmentOutboxKey = (scope: WebDavRelayBodyScope) => `${scope.key}:attachment-outbox`;

export async function hasWebDavRelayAttachmentsToSend(db: DbPort, scope: WebDavRelayBodyScope) {
  const [row] = await db.query<{ pending: number }>(`SELECT EXISTS (SELECT 1 FROM sync_group_metadata
    WHERE key = ? OR (key >= ? AND key < ? AND value = 'pending')) AS pending`,
  [webDavRelayAttachmentOutboxKey(scope), prefix(scope), `${scope.key}:attachment;`]);
  return row?.pending === 1;
}

export async function enqueueWebDavRelayAttachments(db: DbPort, scope: WebDavRelayBodyScope, keys: readonly string[]) {
  if (!keys.length) return;
  await db.run(`INSERT OR IGNORE INTO sync_group_metadata (key, value, updated_at)
    SELECT ? || value, 'pending', ? FROM json_each(?)`, [prefix(scope), new Date().toISOString(), JSON.stringify(keys)]);
}

export async function markWebDavRelayAttachment(db: DbPort, scope: WebDavRelayBodyScope, key: string, state: 'done' | 'pending') {
  await db.run(`INSERT INTO sync_group_metadata (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  [prefix(scope) + key, state, new Date().toISOString()]);
}

export async function resumeWebDavRelayAttachment(input: Input) {
  const [row] = await input.host.readSnapshot(db => db.query<{ value: string }>(
    'SELECT value FROM sync_group_metadata WHERE key = ?', [webDavRelayAttachmentOutboxKey(input.scope)]), input.signal);
  if (!row) return true;
  if (input.lanConnected()) return false;
  input.progress.retries++;
  return publish(input, pendingSchema.parse(JSON.parse(row.value)));
}

export async function publishWebDavRelayAttachments(input: Input) {
  const { host, scope } = input;
  const keys = await host.readSnapshot(db => db.query<{ key: string }>(`SELECT key FROM sync_group_metadata
    WHERE key >= ? AND key < ? AND value = 'pending' ORDER BY updated_at, key LIMIT 64`,
  [prefix(scope), `${scope.key}:attachment;`]), input.signal);
  for (const row of keys) {
    if (input.lanConnected()) return;
    await input.assertScope();
    const key = attachmentBlockResourceSchema.shape.storageKey.parse(row.key.slice(prefix(scope).length));
    const pending = await freeze(input, key);
    if (!pending) continue;
    if (!await publish(input, pending)) return;
  }
}

async function freeze(input: Input, key: string) {
  const { host, scope, signal } = input;
  try {
    const pending = await input.attachments.withFile(key, async file => {
      if (file.modifiedAt === undefined || !Number.isFinite(scope.baseline.capturedAt)) {
        throw new Error('webdav_relay_attachment_time_unavailable');
      }
      if (file.modifiedAt < scope.baseline.capturedAt) return null;
      const wire = await prepareWebDavAttachment(file, { context: scope.send, groupKey: input.groupKey, signal });
      return { key, ...await stageWebDavRelayPacket(input.files, scope, wire, WEB_DAV_ATTACHMENT_SUFFIX) };
    }, { shouldYield: () => { signal?.throwIfAborted(); return input.lanConnected(); } });
    if (pending) await host.write(db => db.run('INSERT INTO sync_group_metadata (key, value, updated_at) VALUES (?, ?, ?)',
      [webDavRelayAttachmentOutboxKey(scope), JSON.stringify(pending), new Date().toISOString()]));
    else await host.write(db => markWebDavRelayAttachment(db, scope, key, 'done'));
    return pending;
  } catch (error) {
    if (!(error instanceof AttachmentVerificationPending) &&
        !(error instanceof Error && error.message === 'attachment_source_missing')) throw error;
    await host.write(db => markWebDavRelayAttachment(db, scope, key, 'pending'));
    return null;
  }
}

async function publish(input: Input, pending: Pending) {
  const { host, scope, files, request } = input;
  await input.assertScope();
  if (input.lanConnected()) return false;
  await publishWebDavRelayFile(request, new URL(pending.name, scope.outgoing), webDavRelayPacketBytes(files, scope, pending));
  await host.write(db => db.transaction(async tx => {
    await markWebDavRelayAttachment(tx, scope, pending.key, 'done');
    await recordRelayCollectionAttachment(tx, scope.key, pending.key);
    await tx.run('DELETE FROM sync_group_metadata WHERE key = ?', [webDavRelayAttachmentOutboxKey(scope)]);
  }));
  input.progress.published++;
  await files.remove(webDavRelayPacketDirectory(scope));
  return true;
}
