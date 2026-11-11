import { z } from 'zod';

import { WEB_DAV_ATTACHMENT_MIB } from '../../platform/webDavRelayContract.js';

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
import { ensureWebDavCollection } from './webDavRelayCollections.js';
import { publishWebDavRelayAttachment, type WebDavRelayRequest } from './webDavRelayPublication.js';
import { resolveWebDavRelayRepairKeys } from './webDavRelayRepairAuthorization.js';
import { repairRequestSchema, type RepairRequest } from './webDavRelayRepairWire.js';

const pendingSchema = webDavRelayPacketSchema.pick({ name: true, chunks: true, bytes: true })
  .extend({ key: attachmentBlockResourceSchema.shape.storageKey, resourceBytes: attachmentBlockResourceSchema.shape.byteLength.optional(), repairId: z.string().optional() });
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
    WHERE key = ? OR (key >= ? AND key < ? AND (value = 'pending' OR substr(value, 1, 1) = '{'))) AS pending`,
  [webDavRelayAttachmentOutboxKey(scope), prefix(scope), `${scope.key}:attachment;`]);
  return row?.pending === 1;
}

export async function enqueueWebDavRelayAttachments(db: DbPort, scope: WebDavRelayBodyScope, keys: readonly string[]) {
  if (!keys.length) return;
  await db.run(`INSERT OR IGNORE INTO sync_group_metadata (key, value, updated_at)
    SELECT ? || value, 'pending', ? FROM json_each(?)`, [prefix(scope), new Date().toISOString(), JSON.stringify(keys)]);
}

export async function markWebDavRelayAttachment(db: DbPort, scope: WebDavRelayBodyScope, key: string, state: 'done' | 'pending' | 'lan') {
  await db.run(`INSERT INTO sync_group_metadata (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  [prefix(scope) + key, state, new Date().toISOString()]);
}

export async function enqueueWebDavRelayAttachmentRepairs(db: DbPort, scope: WebDavRelayBodyScope, repair: RepairRequest) {
  if (scope.attachmentPolicy.mode === 'off') return;
  const keys = await resolveWebDavRelayRepairKeys(db, repair.demand);
  for (const key of keys) {
    await db.run(`UPDATE sync_group_metadata SET value = ?, updated_at = ? WHERE key = ?`,
      [JSON.stringify({ ...repair, demand: repair.demand.filter(([hash]) => key.startsWith(hash)) }), new Date().toISOString(), prefix(scope) + key]);
  }
}

async function readRepair(input: Input, key: string) {
  const [row] = await input.host.readSnapshot(db => db.query<{ value: string }>(
    'SELECT value FROM sync_group_metadata WHERE key = ?', [prefix(input.scope) + key]), input.signal);
  return row?.value.startsWith('{') ? repairRequestSchema.parse(JSON.parse(row.value)) : undefined;
}

async function isAuthorizedRepair(input: Input, key: string, repair: RepairRequest) {
  return input.scope.attachmentPolicy.mode !== 'off' && (await input.host.readSnapshot(
    db => resolveWebDavRelayRepairKeys(db, repair.demand), input.signal)).includes(key);
}

export async function resumeWebDavRelayAttachment(input: Input) {
  const [row] = await input.host.readSnapshot(db => db.query<{ value: string }>(
    'SELECT value FROM sync_group_metadata WHERE key = ?', [webDavRelayAttachmentOutboxKey(input.scope)]), input.signal);
  if (!row) return true;
  if (input.lanConnected()) return false;
  input.progress.retries++;
  const pending = pendingSchema.parse(JSON.parse(row.value));
  const repair = await readRepair(input, pending.key);
  const limit = input.scope.attachmentPolicy;
  if (repair && (!await isAuthorizedRepair(input, pending.key, repair) ||
      (limit.mode === 'limited' && pending.resourceBytes !== undefined &&
        pending.resourceBytes > limit.max_mib * WEB_DAV_ATTACHMENT_MIB))) {
    await discardStaged(input, pending.key, 'lan');
    return true;
  }
  if (repair?.replace && repair.id !== pending.repairId) {
    await input.assertScope();
    await discardStaged(input, pending.key);
    return true;
  }
  try { return await publish(input, pending, repair); }
  catch (error) {
    if (!repair || !(error instanceof Error) || error.message !== 'webdav_relay_destination_conflict') throw error;
    await input.assertScope();
    await discardStaged(input, pending.key);
    return true;
  }
}

export async function publishWebDavRelayAttachments(input: Input) {
  const { host, scope } = input;
  if (scope.attachmentPolicy.mode === 'off') {
    await host.write(db => db.run(`UPDATE sync_group_metadata SET value = 'lan', updated_at = ?
      WHERE key >= ? AND key < ? AND (value = 'pending' OR substr(value, 1, 1) = '{')`,
    [new Date().toISOString(), prefix(scope), `${scope.key}:attachment;`]));
    return;
  }
  const keys = await host.readSnapshot(db => db.query<{ key: string }>(`SELECT key FROM sync_group_metadata
    WHERE key >= ? AND key < ? AND (value = 'pending' OR substr(value, 1, 1) = '{') ORDER BY updated_at, key LIMIT 64`,
  [prefix(scope), `${scope.key}:attachment;`]), input.signal);
  for (const row of keys) {
    if (input.lanConnected()) return;
    await input.assertScope();
    const key = attachmentBlockResourceSchema.shape.storageKey.parse(row.key.slice(prefix(scope).length));
    const repair = await readRepair(input, key);
    if (repair && !await isAuthorizedRepair(input, key, repair)) {
      await host.write(db => markWebDavRelayAttachment(db, scope, key, 'lan'));
      continue;
    }
    const pending = await freeze(input, key, repair);
    if (!pending) continue;
    if (!await publish(input, pending, repair)) return;
  }
}

async function freeze(input: Input, key: string, repair?: RepairRequest) {
  const { host, scope, signal } = input;
  try {
    const pending = await input.attachments.withFile(key, async file => {
      if (file.modifiedAt === undefined || !Number.isFinite(scope.baseline.capturedAt)) {
        throw new Error('webdav_relay_attachment_time_unavailable');
      }
      if (file.modifiedAt < scope.baseline.capturedAt) return null;
      const policy = scope.attachmentPolicy;
      if (policy.mode === 'limited' && file.resource.byteLength > policy.max_mib * WEB_DAV_ATTACHMENT_MIB) return 'lan';
      const wire = await prepareWebDavAttachment(file, { context: scope.send, groupKey: input.groupKey, signal });
      return { key, resourceBytes: file.resource.byteLength, ...(repair ? { repairId: repair.id } : {}), ...await stageWebDavRelayPacket(input.files, scope, wire, WEB_DAV_ATTACHMENT_SUFFIX) };
    }, { shouldYield: () => { signal?.throwIfAborted(); return input.lanConnected(); } });
    if (pending && pending !== 'lan') await host.write(db => db.run('INSERT INTO sync_group_metadata (key, value, updated_at) VALUES (?, ?, ?)',
      [webDavRelayAttachmentOutboxKey(scope), JSON.stringify(pending), new Date().toISOString()]));
    else await host.write(db => markWebDavRelayAttachment(db, scope, key, pending ?? 'done'));
    return pending === 'lan' ? null : pending;
  } catch (error) {
    if (!(error instanceof AttachmentVerificationPending) &&
        !(error instanceof Error && error.message === 'attachment_source_missing')) throw error;
    if (!repair) await host.write(db => markWebDavRelayAttachment(db, scope, key, 'pending'));
    return null;
  }
}

async function publish(input: Input, pending: Pending, repair?: RepairRequest) {
  const { host, scope, files, request } = input;
  await input.assertScope();
  if (input.lanConnected()) return false;
  if (repair) await ensureWebDavCollection(request, scope.outgoing);
  const assertPublication = async () => {
    await input.assertScope();
    if (repair && !await isAuthorizedRepair(input, pending.key, repair)) throw new Error('webdav_relay_repair_authorization_changed');
  };
  await assertPublication();
  await publishWebDavRelayAttachment(request, new URL(pending.name, scope.outgoing),
    webDavRelayPacketBytes(files, scope, pending), assertPublication);
  await input.assertScope();
  await host.write(db => db.transaction(async tx => {
    await markWebDavRelayAttachment(tx, scope, pending.key, 'done');
    await recordRelayCollectionAttachment(tx, scope.key, pending.key);
    await tx.run('DELETE FROM sync_group_metadata WHERE key = ?', [webDavRelayAttachmentOutboxKey(scope)]);
  }));
  input.progress.published++;
  await files.remove(webDavRelayPacketDirectory(scope));
  return true;
}

async function discardStaged(input: Input, key: string, state?: 'lan') {
  const { host, scope, files } = input;
  await host.write(db => db.transaction(async tx => {
    if (state) await markWebDavRelayAttachment(tx, scope, key, state);
    await tx.run('DELETE FROM sync_group_metadata WHERE key = ?', [webDavRelayAttachmentOutboxKey(scope)]);
  }));
  await files.remove(webDavRelayPacketDirectory(scope));
}
