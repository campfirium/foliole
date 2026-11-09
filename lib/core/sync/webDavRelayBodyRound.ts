import type { FramedSyncFilePort } from './framedSyncFilePort.js';
import type { RequestSyncDatabaseHost } from './requestSyncObjectEndpoint.js';
import { freezeWebDavRelayBodyPacket, readWebDavRelayBodyOutbox, webDavRelayPacketBytes,
  webDavRelayPacketDirectory, writeWebDavRelayBodyOutbox } from './webDavRelayBodyOutbox.js';
import { receiveWebDavRelayBodyPackets } from './webDavRelayBodyReceive.js';
import type { WebDavRelayBodyScope } from './webDavRelayBodyScope.js';
import { publishWebDavRelayFile, webDavRelayStatus, type WebDavRelayRequest } from './webDavRelayPublication.js';

type Input = {
  host: RequestSyncDatabaseHost;
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
    await publishChanges(input);
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
    const packet = state.packet ?? await freezeWebDavRelayBodyPacket({ ...input, sequence: state.sequence, upper });
    if (!packet) return;
    if (!state.packet) await host.write(db => writeWebDavRelayBodyOutbox(db, scope, { sequence: state.sequence, packet }));
    if (input.lanConnected()) return;
    if (!collectionReady) {
      await ensureCollection(request, scope.outgoing);
      collectionReady = true;
    }
    await input.assertScope();
    if (input.lanConnected()) return;
    if (state.packet) input.progress.retries++;
    await publishWebDavRelayFile(request, new URL(packet.name, scope.outgoing), webDavRelayPacketBytes(files, scope, packet));
    await host.write(db => writeWebDavRelayBodyOutbox(db, scope, { sequence: packet.through, packet: null }));
    input.progress.published++;
    await files.remove(webDavRelayPacketDirectory(scope));
  }
}

async function ensureCollection(request: WebDavRelayRequest, directory: URL) {
  const probe = () => request(directory, { method: 'PROPFIND', headers: { Depth: '0' } }, webDavRelayStatus);
  const existing = await probe();
  if (existing === 207) return;
  if (existing !== 404) throw new Error(`webdav_relay_collection_failed:${existing}`);
  const created = await request(directory, { method: 'MKCOL' }, webDavRelayStatus);
  if (created === 201 || (created === 405 && await probe() === 207)) return;
  throw new Error(`webdav_relay_collection_failed:${created}`);
}
