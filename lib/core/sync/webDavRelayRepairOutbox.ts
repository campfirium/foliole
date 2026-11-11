import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { z } from 'zod';

import { attachmentWorkBudget } from './attachmentWorkBudget.js';
import type { DbPort } from './dbPort.js';
import type { FramedSyncFilePort } from './framedSyncFilePort.js';
import type { RequestSyncAttachmentHost } from './requestSyncAttachmentResponse.js';
import type { RequestSyncDatabaseHost } from './requestSyncObjectEndpoint.js';
import { stageWebDavRelayPacket, webDavRelayPacketBytes, webDavRelayPacketDirectory } from './webDavRelayBodyOutbox.js';
import type { WebDavRelayBodyScope } from './webDavRelayBodyScope.js';
import { ensureWebDavCollection } from './webDavRelayCollections.js';
import { publishWebDavRelayFile, type WebDavRelayRequest } from './webDavRelayPublication.js';
import { prepareWebDavRelayRepair, repairDemandSchema, WEB_DAV_REPAIR_SUFFIX } from './webDavRelayRepairWire.js';

const packetSchema = z.object({
  name: z.string().regex(/^\d{8}T\d{6}\.\d{3}Z-[a-f0-9-]{36}\.repair\.bin$/u),
  chunks: z.number().int().positive(),
  bytes: z.number().int().positive()
});
const stateSchema = z.object({
  sent: z.array(z.string()), demand: repairDemandSchema, packet: packetSchema.optional(),
  policy: z.string(), replace: z.boolean(), more: z.boolean()
});
type State = z.infer<typeof stateSchema>;
type Input = {
  host: RequestSyncDatabaseHost;
  scope: WebDavRelayBodyScope;
  files: FramedSyncFilePort;
  attachments: RequestSyncAttachmentHost;
  groupKey: Uint8Array;
  request: WebDavRelayRequest;
  signal?: AbortSignal;
  assertScope(): Promise<void>;
  lanConnected(): boolean;
};

const key = (scope: WebDavRelayBodyScope) => `${scope.key}:repair-outbox`;
function directory(scope: WebDavRelayBodyScope) {
  const path = webDavRelayPacketDirectory(scope);
  const source = bytesToHex(sha256(new TextEncoder().encode(`${path}:repair`)));
  return `${path.slice(0, -64)}${source}`;
}

async function read(db: DbPort, scope: WebDavRelayBodyScope): Promise<State> {
  const [row] = await db.query<{ value: string }>('SELECT value FROM sync_group_metadata WHERE key = ?', [key(scope)]);
  return row ? stateSchema.parse(JSON.parse(row.value)) : { sent: [], demand: [], policy: '', replace: false, more: false };
}

async function write(db: DbPort, scope: WebDavRelayBodyScope, state: State) {
  await db.run(`INSERT INTO sync_group_metadata (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  [key(scope), JSON.stringify(state), new Date().toISOString()]);
}

export async function hasWebDavRelayRepairToSend(db: DbPort, scope: WebDavRelayBodyScope) {
  const state = await read(db, scope);
  return state.more || state.demand.length > 0;
}

export async function rearmWebDavRelayRepair(db: DbPort, scope: WebDavRelayBodyScope) {
  const state = await read(db, scope);
  await write(db, scope, { ...state, sent: [], packet: undefined, replace: true });
}

export async function refreshWebDavRelayRepair(input: Input) {
  const { host, scope, signal } = input;
  const state = await host.readSnapshot(db => read(db, scope), signal);
  const policy = JSON.stringify(scope.attachmentPolicy);
  if (scope.attachmentPolicy.mode === 'off') {
    if (state.demand.length || state.sent.length || state.more) {
      await host.write(db => write(db, scope, { sent: [], demand: [], policy, replace: false, more: false }));
      if (state.packet) await input.files.remove(directory(scope));
    }
    return;
  }
  if (input.lanConnected()) return;
  const sent = state.policy !== policy ? [] : state.sent;
  const { demand, more } = await collectDemand(input, sent);
  const retained = await host.readSnapshot(async db => {
    const rows = await db.query<{ hash: string }>(`SELECT wanted.value AS hash FROM json_each(?) wanted
      WHERE EXISTS (SELECT 1 FROM attachment_pending
        WHERE storage_key >= wanted.value || '.' AND storage_key < wanted.value || '/')`, [JSON.stringify(sent)]);
    return rows.map(row => row.hash);
  }, signal);
  await input.assertScope();
  const sameDemand = JSON.stringify(demand) === JSON.stringify(state.demand);
  const replace = state.replace && (demand.length > 0 || more);
  const packet = sameDemand && replace === state.replace ? state.packet : undefined;
  const next = { sent: retained.sort(), demand, ...(packet ? { packet } : {}), policy, replace, more };
  if (JSON.stringify(next) !== JSON.stringify(state)) await host.write(db => write(db, scope, next));
  if (state.packet && !packet) await input.files.remove(directory(scope));
}

async function collectDemand(input: Input, sent: string[]) {
  const budget = attachmentWorkBudget();
  const shouldYield = () => Boolean(input.signal?.aborted || input.lanConnected() || budget());
  const selected = new Map<string, string>();
  const seen = new Set(sent);
  const excluded: string[] = [];
  for (;;) {
    const slice = await input.attachments.needsSlice(shouldYield, excluded.length ? excluded : undefined);
    const candidates = await input.host.readSnapshot(db => selectDemand(db, slice.keys, seen), input.signal);
    for (const [hash, article] of candidates) {
      if (selected.size === 64) return { demand: [...selected], more: true };
      selected.set(hash, article);
      seen.add(hash);
    }
    if (!slice.pending || !slice.keys.length) return { demand: [...selected], more: false };
    if (selected.size === 64 || shouldYield()) return { demand: [...selected], more: true };
    excluded.push(...slice.keys);
  }
}

async function selectDemand(db: DbPort, keys: string[], sent: Set<string>) {
  if (!keys.length) return [];
  const rows = await db.query<{ storage_key: string; article_id: string }>(`SELECT p.storage_key, min(p.article_id) AS article_id
    FROM attachment_pending p JOIN sync_object_state s ON s.object_type = 'node' AND s.object_id = p.article_id
    WHERE p.storage_key IN (SELECT value FROM json_each(?)) AND s.deleted_at IS NULL AND s.current_version_id IS NOT NULL
    GROUP BY p.storage_key ORDER BY p.storage_key`, [JSON.stringify(keys)]);
  const demand = new Map<string, string>();
  for (const row of rows) {
    const hash = row.storage_key.slice(0, 64);
    if (!sent.has(hash) && !demand.has(hash)) demand.set(hash, row.article_id);
  }
  return [...demand];
}

export async function publishWebDavRelayRepair(input: Input) {
  const { host, scope, files, request, signal } = input;
  if (input.lanConnected()) return false;
  const state = await host.readSnapshot(db => read(db, scope), signal);
  if (!state.demand.length) return false;
  const slot = directory(scope);
  const packet = state.packet ?? await stageWebDavRelayPacket(files, scope,
    await prepareWebDavRelayRepair(input, state.demand, state.replace), WEB_DAV_REPAIR_SUFFIX, slot);
  if (!state.packet) await host.write(db => write(db, scope, { ...state, packet }));
  await ensureWebDavCollection(request, scope.outgoing);
  await input.assertScope();
  if (input.lanConnected()) return false;
  await publishWebDavRelayFile(request, new URL(packet.name, scope.outgoing), webDavRelayPacketBytes(files, scope, packet, slot));
  await input.assertScope();
  await host.write(db => write(db, scope, { sent: [...new Set([...state.sent, ...state.demand.map(([hash]) => hash)])],
    demand: [], policy: state.policy, replace: state.replace && state.more, more: state.more }));
  await files.remove(slot);
  return true;
}
