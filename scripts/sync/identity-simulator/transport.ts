import http from 'node:http';
import type { AddressInfo, Socket } from 'node:net';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { createLanWorkspaceSyncRequestHandler } from '../../../electron/sync/companionLanRequestHandler.js';
import { postDesktopWorkgroupJson } from '../../../electron/sync/desktopSyncGroupHttp.js';
import { runDesktopSyncIdentityRound } from '../../../electron/sync/desktopSyncIdentityRound.js';
import { createCompanionSyncbackDbStore } from '../../../src/shared/platform/companion/sync/syncback/companionSyncbackDbStore.js';
import { pushLocalDirtyObjects, toPushAck } from '../../../src/shared/platform/companionDesktopSyncPush.js';
import { nodeVersionSyncAdapter } from '../../../src/shared/platform/companionSyncPushProtocol.js';

import { assertCompleted } from './assertions.js';
import { operations } from './operations.js';
import { secret } from './peers.js';
import { inPeer, type SimulatorPeer } from './scope.js';

export interface Endpoint {
  origin: string; peer: SimulatorPeer; requests: string[];
  responseEvents: Array<{ route: string; status: number; elapsedMs: number;
    outcome: 'finished' | 'closed' | 'error' }>;
  interrupt: { path: string; remaining: number } | null;
  loseResponse: string | null;
  afterResponse?: (route: string) => void;
  transferBytes(): { received: number; sent: number; total: number };
  close(): Promise<void>;
}
export async function serve(peer: SimulatorPeer): Promise<Endpoint> {
  const requests: string[] = [];
  const responseEvents: Endpoint['responseEvents'] = [];
  const sockets = new Set<Socket>();
  let closedReceived = 0;
  let closedSent = 0;
  const handler = createLanWorkspaceSyncRequestHandler({ appVersion: 'simulator',
    deviceId: peer.id, onJoinRequestCreated: null, updateGroupStatus: () => {} });
  const endpoint: Endpoint = { peer, requests, responseEvents,
    origin: '', interrupt: null, loseResponse: null,
    transferBytes: () => {
      const received = closedReceived + [...sockets].reduce((sum, socket) => sum + socket.bytesRead, 0);
      const sent = closedSent + [...sockets].reduce((sum, socket) => sum + socket.bytesWritten, 0);
      return { received, sent, total: received + sent };
    },
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
  const server = http.createServer((request, response) => inPeer(peer, () => {
    const route = request.url ?? '';
    const started = Date.now();
    response.once('finish', () => responseEvents.push({ route, status: response.statusCode,
      elapsedMs: Date.now() - started, outcome: 'finished' }));
    response.once('close', () => {
      if (!response.writableEnded) responseEvents.push({ route,
        status: response.statusCode, elapsedMs: Date.now() - started, outcome: 'closed' });
    });
    response.once('error', () => responseEvents.push({ route, status: response.statusCode,
      elapsedMs: Date.now() - started, outcome: 'error' }));
    requests.push(route);
    operations.push({ action: 'http', peer: peer.name, method: request.method, route });
    response.once('finish', () => endpoint.afterResponse?.(route));
    const fault = endpoint.interrupt;
    if (fault && new URL(route, 'http://localhost').pathname === fault.path && --fault.remaining === 0) {
      endpoint.interrupt = null;
      operations.push({ action: 'disconnect', peer: peer.name, route });
      request.socket.destroy();
      return;
    }
    if (new URL(route, 'http://localhost').pathname === endpoint.loseResponse) {
      endpoint.loseResponse = null;
      response.end = (() => {
        operations.push({ action: 'lose-response', peer: peer.name, route });
        response.destroy();
        return response;
      }) as typeof response.end;
    }
    void handler(request, response);
  }));
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => {
      closedReceived += socket.bytesRead;
      closedSent += socket.bytesWritten;
      sockets.delete(socket);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  endpoint.origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return endpoint;
}
export function route(endpoint: Endpoint, target: SimulatorPeer) {
  return { endpoint_url: endpoint.origin, group_id: 'group', local_device_id: target.id,
    peer_device_id: endpoint.peer.id, peer_device_name: endpoint.peer.name, peer_platform: 'mac' as const };
}
export async function pull(endpoint: Endpoint, target: SimulatorPeer, receipt = true,
  missingKeys: ReadonlySet<string> = new Set()) {
  return inPeer(target, async () => {
    const peer = route(endpoint, target);
    const round = await runDesktopSyncIdentityRound(peer).catch(async (error: unknown) => {
      if (!missingKeys.size || !(error instanceof Error) ||
          error.message !== 'sync_group_resources_incomplete') throw error;
      const pending = target.sqlite.prepare('SELECT COUNT(*) FROM sync_pack_resource_articles').pluck().get();
      if (!pending) throw error;
      await assertCompleted(target, missingKeys);
      operations.push({ action: 'expected-resource-partial', peer: target.name,
        missingKeys: [...missingKeys] });
      return { received: { pageCount: 0 } };
    });
    if (receipt && target.sqlite.prepare('SELECT COUNT(*) FROM node_version_inbound_receipts')
      .pluck().get() !== 0) throw new Error('identity_unexpected_legacy_version_receipt');
    return round.received.pageCount;
  });
}
export function mobileStore(peer: SimulatorPeer) {
  const port = createBetterSqliteDbPort(peer.sqlite);
  return createCompanionSyncbackDbStore({ ...port, query: (sql, params = []) => {
    if (!/\?\d+/.test(sql)) return port.query(sql, params);
    const bound: (typeof params)[number][] = [];
    const positional = sql.replace(/\?(\d+)/g, (_, index: string) => {
      bound.push(params[Number(index) - 1]!);
      return '?';
    });
    return port.query(positional, bound);
  } });
}
export async function push(endpoint: Endpoint, mobile: SimulatorPeer, save = true) {
  return inPeer(mobile, async () => {
    if (save) {
      const result = await pushLocalDirtyObjects(endpoint.origin);
      if (result.pushError || result.pushRejectedCount || result.pushConflictCount) {
        throw new Error(`simulator_shared_push_failed:${JSON.stringify(result)}`);
      }
      return [];
    }
    const store = mobileStore(mobile);
    const records = await store.loadNodeVersions(endpoint.peer.id, null);
    const items = records.map((row) => nodeVersionSyncAdapter.buildPushPayload(row));
    await store.stagePushItems(endpoint.peer.id, items);
    const response = await postDesktopWorkgroupJson({ endpointUrl: endpoint.origin, groupId: 'group',
      localDeviceId: mobile.id, pathWithQuery: '/companion/sync-push', secret, body: JSON.stringify({ items }) });
    const acks = (response.acks as Parameters<typeof toPushAck>[0][]).map(toPushAck);
    if (acks.some((ack) => !['accepted', 'already_applied'].includes(ack.status))) {
      throw new Error(`simulator_push_rejected:${JSON.stringify(acks)}`);
    }
    if (save) await store.savePushAcks(endpoint.peer.id, acks);
    return acks;
  });
}
