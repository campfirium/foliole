import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { createLanWorkspaceSyncRequestHandler } from '../../../electron/sync/companionLanRequestHandler.js';
import { continueDesktopSyncGroupSync } from '../../../electron/sync/desktopSyncGroupTransport.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../../lib/core/sync/framedSyncContract.js';
import { exchangeCompanionSyncGroupMemberState } from '../../../src/shared/platform/companion/network/companionSyncGroupMemberState.js';
import { syncCompanionObjectsFromDesktop } from '../../../src/shared/platform/companionDesktopSyncObjects.js';


import { assertCompleted } from './assertions.js';
import { operations } from './operations.js';
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
    if (fault && matchesFault(route, fault.path) && --fault.remaining === 0) {
      endpoint.interrupt = null;
      operations.push({ action: 'disconnect', peer: peer.name, route });
      request.socket.destroy();
      return;
    }
    if (matchesFault(route, endpoint.loseResponse)) {
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
export async function pull(endpoint: Endpoint, target: SimulatorPeer,
  missingKeys: ReadonlySet<string> = new Set()) {
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

export async function push(endpoint: Endpoint, mobile: SimulatorPeer) {
  await pull(endpoint, mobile);
}

function matchesFault(route: string, fault: string | null) {
  if (!fault) return false;
  const actual = new URL(route, 'http://localhost');
  const expected = new URL(fault, 'http://localhost');
  return actual.pathname === expected.pathname && [...expected.searchParams]
    .every(([key, value]) => actual.searchParams.get(key) === value);
}
