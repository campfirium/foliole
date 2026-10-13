import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { createLanWorkspaceSyncRequestHandler } from '../../../electron/sync/companionLanRequestHandler.js';
import { postDesktopWorkgroupJson } from '../../../electron/sync/desktopSyncGroupHttp.js';
import { continueDesktopSyncGroupSync } from '../../../electron/sync/desktopSyncGroupTransport.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../../lib/core/sync/framedSyncContract.js';
import { exchangeCompanionSyncGroupMemberState } from '../../../src/shared/platform/companion/network/companionSyncGroupMemberState.js';
import { createCompanionSyncbackDbStore } from '../../../src/shared/platform/companion/sync/syncback/companionSyncbackDbStore.js';
import { syncCompanionObjectsFromDesktop } from '../../../src/shared/platform/companionDesktopSyncObjects.js';
import { toPushAck } from '../../../src/shared/platform/companionDesktopSyncPush.js';
import { nodeVersionSyncAdapter } from '../../../src/shared/platform/companionSyncPushProtocol.js';


import { assertCompleted } from './assertions.js';
import { operations } from './operations.js';
import { secret } from './peers.js';
import { inPeer, type SimulatorPeer } from './scope.js';

export interface Endpoint {
  origin: string; peer: SimulatorPeer; requests: string[];
  interrupt: { path: string; remaining: number } | null;
  loseResponse: string | null;
  afterResponse?: (route: string) => void;
  close(): Promise<void>;
}
export async function serve(peer: SimulatorPeer): Promise<Endpoint> {
  const requests: string[] = [];
  const handler = createLanWorkspaceSyncRequestHandler({ appVersion: 'simulator',
    deviceId: peer.id, onJoinRequestCreated: null, updateGroupStatus: () => {} });
  const endpoint: Endpoint = { peer, requests, origin: '', interrupt: null, loseResponse: null,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
  const server = http.createServer((request, response) => inPeer(peer, () => {
    const route = request.url ?? '';
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
  if (!receipt) throw new Error('simulator_legacy_receipt_scenario_requires_migration');
  return inPeer(target, async () => {
    if (process.env.FOLIOLE_SIM_PATH === 'companion' && target.name === 'b') {
      const state = await exchangeCompanionSyncGroupMemberState({ endpointUrl: endpoint.origin,
        deviceId: endpoint.peer.id, groupId: 'group' });
      if (!state.normalSyncReady || !state.peerLibraryEpoch) throw new Error('simulator_peer_not_ready');
      const result = await syncCompanionObjectsFromDesktop(endpoint.origin, { framedPeer: {
        deviceId: endpoint.peer.id, libraryEpoch: state.peerLibraryEpoch,
        protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION } });
      if (result.pushError || result.pushRejectedCount || result.pushConflictCount) {
        throw new Error(`simulator_request_failed:${JSON.stringify(result)}`);
      }
    } else {
      const result = await continueDesktopSyncGroupSync(route(endpoint, target));
      if (!result?.complete && !missingKeys.size) throw new Error('simulator_request_incomplete');
    }
    await assertCompleted(target, missingKeys);
    return 0;
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
      await pull(endpoint, mobile);
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
