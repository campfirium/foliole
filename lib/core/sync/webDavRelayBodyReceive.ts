import type { AttachmentBlockDestination } from './attachmentBlockTransfer.js';
import { readFramedSyncStream } from './framedSyncBinaryStream.js';
import { FRAMED_SYNC_LIMITS } from './framedSyncContract.js';
import { readFramedSyncMissingDependency } from './framedSyncInventoryRoundDelivery.js';
import { receiveRequestSyncBatch } from './requestSyncBatchReceiver.js';
import type { RequestSyncDatabaseHost } from './requestSyncObjectEndpoint.js';
import { enqueueWebDavRelayAttachmentRepairs, markWebDavRelayAttachment } from './webDavRelayAttachments.js';
import { receiveWebDavAttachment, WEB_DAV_ATTACHMENT_SUFFIX } from './webDavRelayAttachmentWire.js';
import { webDavRelayPeerState, type WebDavRelayBodyScope } from './webDavRelayBodyScope.js';
import { relayGeneration, relayGenerationRoot } from './webDavRelayCollections.js';
import { readWebDavRelayPacket } from './webDavRelayPacketRead.js';
import { webDavRelayStatus, type WebDavRelayRequest } from './webDavRelayPublication.js';
import { rearmWebDavRelayRepair } from './webDavRelayRepairOutbox.js';
import { readWebDavRelayRepair, WEB_DAV_REPAIR_SUFFIX } from './webDavRelayRepairWire.js';

const packetName = /^\d{8}T\d{6}\.\d{3}Z-[a-f0-9-]{36}(?:\.asset|\.repair)?\.bin$/u;

type Input = {
  host: RequestSyncDatabaseHost;
  attachments?: AttachmentBlockDestination;
  request: WebDavRelayRequest;
  scope: WebDavRelayBodyScope;
  groupKey: Uint8Array;
  signal?: AbortSignal;
  assertScope(): Promise<void>;
  applied(count: number): void;
  retry(count: number): void;
};

export async function receiveWebDavRelayBodyPackets(input: Input) {
  const names = await listIncomingPackets(input.request, input.scope.incoming);
  const pending = await input.host.readSnapshot(async db => {
    const prefix = `${input.scope.key}:applied:`;
    const rows = await db.query<{ key: string }>(
      'SELECT key FROM sync_group_metadata WHERE key >= ? AND key < ?', [prefix, `${input.scope.key}:applied;`]);
    const applied = new Set(rows.map(row => row.key.slice(prefix.length)));
    return names.filter(packet => !applied.has(packet.name));
  }, input.signal);
  let remaining = pending.filter(packet => !packet.name.endsWith(WEB_DAV_ATTACHMENT_SUFFIX) && !packet.name.endsWith(WEB_DAV_REPAIR_SUFFIX));
  while (remaining.length) {
    const deferred = [];
    for (const name of remaining) {
      try { await receivePacket(input, name); }
      catch (error) {
        if (!readFramedSyncMissingDependency(error)) throw error;
        deferred.push(name);
      }
    }
    if (deferred.length === remaining.length) throw new Error('webdav_relay_body_dependency_pending');
    input.retry(deferred.length);
    remaining = deferred;
  }
  let repairQueued = false;
  if (input.attachments) for (const packet of pending) {
    if (packet.name.endsWith(WEB_DAV_ATTACHMENT_SUFFIX)) {
      await receiveAttachment(input, input.attachments, packet);
    } else if (packet.name.endsWith(WEB_DAV_REPAIR_SUFFIX)) {
      if (await receiveRepair(input, packet)) repairQueued = true;
    }
  }
  return repairQueued;
}

type Packet = { name: string; url: URL };

async function listIncomingPackets(request: WebDavRelayRequest, direction: URL) {
  const list = (directory: URL) => request(directory, { method: 'PROPFIND', headers: { Depth: '1' } },
    (status, body) => listChildren(directory, status, body));
  const root = relayGenerationRoot(direction);
  const generations = await list(root);
  const legacy = await list(direction);
  if (!legacy && !generations) {
    const status = await request(new URL('../', direction), { method: 'PROPFIND', headers: { Depth: '0' } }, webDavRelayStatus);
    if (status !== 207) throw new Error(`webdav_relay_folder_unavailable:${status}`);
  }
  const packets = (directory: URL, children: string[]) => children.filter(name => packetName.test(name))
    .map(name => ({ name, url: new URL(name, directory) }));
  const result = packets(direction, legacy ?? []);
  for (const name of generations ?? []) {
    if (!name.endsWith('/') || !relayGeneration.safeParse(name.slice(0, -1)).success) continue;
    const directory = new URL(name, root);
    result.push(...packets(directory, await list(directory) ?? []));
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

async function listChildren(directory: URL, status: number, body: AsyncIterable<Uint8Array>) {
  if (status !== 207) {
    await webDavRelayStatus(status, body);
    if (status === 404) return null;
    throw new Error(`webdav_relay_list_failed:${status}`);
  }
  let xml = '';
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  for await (const bytes of body) {
    size += bytes.byteLength;
    if (size > FRAMED_SYNC_LIMITS.maxSessionBytes) throw new Error('webdav_relay_list_too_large');
    xml += decoder.decode(bytes, { stream: true });
  }
  xml += decoder.decode();
  if (!/<(?:[\w-]+:)?multistatus(?:\s|>)/iu.test(xml)) throw new Error('webdav_relay_list_invalid');
  const names = new Set<string>();
  for (const match of xml.matchAll(/<(?:[\w-]+:)?href>([^<]+)<\/(?:[\w-]+:)?href>/giu)) {
    const entry = URL.parse(match[1]!.trim().replaceAll('&amp;', '&'), directory);
    if (!entry || entry.origin !== directory.origin || !entry.pathname.startsWith(directory.pathname)) continue;
    const name = entry.pathname.slice(directory.pathname.length);
    if (name && !name.replace(/\/$/u, '').includes('/')) names.add(name);
  }
  return [...names].sort();
}

async function receivePacket(input: Input, { name, url }: Packet) {
  await input.assertScope();
  const { host, scope, signal } = input;
  const count = await input.request(url, { method: 'GET' }, async (status, body) => {
    if (status !== 200) {
      await webDavRelayStatus(status, body);
      throw new Error(`webdav_relay_download_failed:${status}`);
    }
    const stream = await readFramedSyncStream(body);
    const result = await receiveRequestSyncBatch(host, { ...stream, context: scope.receive,
      groupKey: input.groupKey, peerState: webDavRelayPeerState(scope), author: 'initiator', receiveReviewsIndependently: true,
      ...(signal ? { signal } : {}) });
    const failure = result.results.find(value => value.error);
    if (failure) throw new Error(failure.error);
    return result.results.length;
  });
  await host.write(db => db.run('INSERT OR IGNORE INTO sync_group_metadata (key, value, updated_at) VALUES (?, ?, ?)',
    [`${scope.key}:applied:${name}`, 'true', new Date().toISOString()]));
  input.applied(count);
}

async function receiveAttachment(input: Input, attachments: AttachmentBlockDestination, { name, url }: Packet) {
  await input.assertScope();
  const { host, scope, signal, groupKey } = input;
  const result = await readWebDavRelayPacket(() => input.request(url, { method: 'GET' }, async (status, body) => {
    if (status !== 200) {
      await webDavRelayStatus(status, body);
      throw new Error(`webdav_relay_download_failed:${status}`);
    }
    return receiveWebDavAttachment(attachments, body, { context: scope.receive, groupKey, signal }, input.assertScope);
  }), input.retry, signal);
  await input.assertScope();
  await host.write(db => db.transaction(async tx => {
    if (result.value) await markWebDavRelayAttachment(tx, scope, result.value, 'done');
    if (result.damaged) await rearmWebDavRelayRepair(tx, scope);
    await tx.run('INSERT OR IGNORE INTO sync_group_metadata (key, value, updated_at) VALUES (?, ?, ?)',
      [`${scope.key}:applied:${name}`, result.damaged ? 'damaged' : 'true', new Date().toISOString()]);
  }));
  if (result.value) input.applied(1);
}

async function receiveRepair(input: Input, { name, url }: Packet) {
  const { host, scope, signal, groupKey } = input;
  await input.assertScope();
  const result = await readWebDavRelayPacket(() => input.request(url, { method: 'GET' }, async (status, body) => {
    if (status !== 200) {
      await webDavRelayStatus(status, body);
      throw new Error(`webdav_relay_download_failed:${status}`);
    }
    return readWebDavRelayRepair({ scope, signal, groupKey }, body);
  }), input.retry, signal);
  await input.assertScope();
  await host.write(db => db.transaction(async tx => {
    if (result.value) {
      const receipt = await tx.run('INSERT OR IGNORE INTO sync_group_metadata (key, value, updated_at) VALUES (?, ?, ?)',
        [`${scope.key}:repair-received:${result.value.id}`, 'true', new Date().toISOString()]);
      if (receipt.changes) await enqueueWebDavRelayAttachmentRepairs(tx, scope, result.value);
    }
    await tx.run('INSERT OR IGNORE INTO sync_group_metadata (key, value, updated_at) VALUES (?, ?, ?)',
      [`${scope.key}:applied:${name}`, result.damaged ? 'damaged' : 'true', new Date().toISOString()]);
  }));
  return Boolean(result.value);
}
