import type { AttachmentBlockDestination } from './attachmentBlockTransfer.js';
import { readFramedSyncStream } from './framedSyncBinaryStream.js';
import { FRAMED_SYNC_LIMITS } from './framedSyncContract.js';
import { readFramedSyncMissingDependency } from './framedSyncInventoryRoundDelivery.js';
import { receiveRequestSyncBatch } from './requestSyncBatchReceiver.js';
import type { RequestSyncDatabaseHost } from './requestSyncObjectEndpoint.js';
import { enqueueWebDavRelayAttachmentRepairs, markWebDavRelayAttachment } from './webDavRelayAttachments.js';
import { receiveWebDavAttachment } from './webDavRelayAttachmentWire.js';
import { webDavRelayPeerState, type WebDavRelayBodyScope } from './webDavRelayBodyScope.js';
import { relayCollectionUrl, relayGeneration, relayGenerationRoot } from './webDavRelayCollections.js';
import { readWebDavRelayPacket } from './webDavRelayPacketRead.js';
import { webDavRelayStatus, type WebDavRelayRequest } from './webDavRelayPublication.js';
import { readMissingRelayReceiptGenerations, readUnappliedRelayPackets, recordRelayPacketReceipt,
  removeRelayCollectionReceipts } from './webDavRelayReceipts.js';
import { rearmWebDavRelayRepair } from './webDavRelayRepairOutbox.js';
import { readWebDavRelayRepair } from './webDavRelayRepairWire.js';

const packetName = /^\d{8}T\d{6}\.\d{3}Z-[a-f0-9-]{36}\.(?:(asset|repair)\.)?(?:dat|bin)$/u;

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
  const { packets, present } = await listIncomingPackets(input.request, input.scope.incoming);
  await reclaimReceipts(input, present);
  if (!packets.length) return { repairQueued: false, bodyPending: false };
  const pending = await input.host.readSnapshot(db => readUnappliedRelayPackets(db, input.scope, packets), input.signal);
  let remaining = pending.filter(packet => !packet.kind);
  while (remaining.length) {
    const deferred = [];
    for (const name of remaining) {
      try { await receivePacket(input, name); }
      catch (error) {
        if (!readFramedSyncMissingDependency(error)) throw error;
        deferred.push(name);
      }
    }
    const stalled = deferred.length === remaining.length;
    remaining = deferred;
    if (stalled) break;
    input.retry(deferred.length);
  }
  let repairQueued = false;
  if (input.attachments) for (const packet of pending) {
    if (packet.kind === 'asset') {
      await receiveAttachment(input, input.attachments, packet);
    } else if (packet.kind === 'repair') {
      if (await receiveRepair(input, packet)) repairQueued = true;
    }
  }
  return { repairQueued, bodyPending: remaining.length > 0 };
}

type Packet = { name: string; generation: string; kind: string | undefined; url: URL };

async function reclaimReceipts({ host, scope, signal, assertScope }: Input, present: ReadonlySet<string>) {
  const missing = await host.readSnapshot(db => readMissingRelayReceiptGenerations(db, scope, present), signal);
  if (!missing.length) return;
  await assertScope();
  await host.write(db => db.transaction(async tx => {
    for (const generation of missing) await removeRelayCollectionReceipts(tx, scope, generation);
  }));
}

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
  const packets = (generation: string, directory: URL, children: string[]): Packet[] => children.flatMap(name => {
    const match = packetName.exec(name);
    return match ? [{ name, generation, kind: match[1], url: new URL(name, directory) }] : [];
  });
  const present = new Set<string>();
  if (legacy) present.add('legacy');
  const result = packets('legacy', direction, legacy ?? []);
  for (const name of generations ?? []) {
    const generation = relayGeneration.safeParse(name.replace(/\/$/u, ''));
    if (!generation.success) continue;
    const directory = relayCollectionUrl(direction, generation.data);
    const children = await list(directory);
    if (!children) continue;
    present.add(generation.data);
    result.push(...packets(generation.data, directory, children));
  }
  return { packets: result.sort((a, b) => a.name.localeCompare(b.name)), present };
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

async function receivePacket(input: Input, packet: Packet) {
  await input.assertScope();
  const { host, scope, signal } = input;
  const count = await input.request(packet.url, { method: 'GET' }, async (status, body) => {
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
  await host.write(db => recordRelayPacketReceipt(db, scope, packet));
  input.applied(count);
}

async function receiveAttachment(input: Input, attachments: AttachmentBlockDestination, packet: Packet) {
  await input.assertScope();
  const { host, scope, signal, groupKey } = input;
  const result = await readWebDavRelayPacket(() => input.request(packet.url, { method: 'GET' }, async (status, body) => {
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
    await recordRelayPacketReceipt(tx, scope, packet, result.damaged);
  }));
  if (result.value) input.applied(1);
}

async function receiveRepair(input: Input, packet: Packet) {
  const { host, scope, signal, groupKey } = input;
  await input.assertScope();
  const result = await readWebDavRelayPacket(() => input.request(packet.url, { method: 'GET' }, async (status, body) => {
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
        [`${scope.key}:repair-received:v2:${result.value.id}`, 'true', new Date().toISOString()]);
      if (receipt.changes) await enqueueWebDavRelayAttachmentRepairs(tx, scope, result.value);
    }
    await recordRelayPacketReceipt(tx, scope, packet, result.damaged);
  }));
  return Boolean(result.value);
}
