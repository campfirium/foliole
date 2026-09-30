import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { createLanWorkspaceSyncRequestHandler } from '../../../electron/sync/companionLanRequestHandler.js';
import { createDesktopSyncGroupSignedHeaders, postDesktopWorkgroupJson } from '../../../electron/sync/desktopSyncGroupHttp.js';
import { downloadAndApplyDesktopSyncGroupPack } from '../../../electron/sync/desktopSyncGroupPackApply.js';
import { drainDesktopSyncGroupResourceArticles } from '../../../electron/sync/desktopSyncGroupResourceArticleDrain.js';
import { flushDesktopSyncGroupVersionReceipts } from '../../../electron/sync/desktopSyncGroupVersionReceipts.js';
import { loadSyncPackReceiveProgress } from '../../../lib/core/sync/syncPackReceiveProgress.js';
import { createCompanionSyncbackDbStore } from '../../../src/shared/platform/companion/sync/syncback/companionSyncbackDbStore.js';
import { pushLocalDirtyObjects, toPushAck } from '../../../src/shared/platform/companionDesktopSyncPush.js';
import { applyCompanionDesktopSyncPack } from '../../../src/shared/platform/companionSyncPackApply.js';
import { nodeVersionSyncAdapter } from '../../../src/shared/platform/companionSyncPushProtocol.js';

import { operations } from './operations.js';
import { secret } from './peers.js';
import { inPeer, type SimulatorPeer } from './scope.js';

export interface Endpoint {
  origin: string; peer: SimulatorPeer; requests: string[];
  interrupt: { path: string; remaining: number } | null;
  loseResponse: string | null;
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
export async function pull(endpoint: Endpoint, target: SimulatorPeer, receipt = true) {
  return inPeer(target, async () => {
    const peer = route(endpoint, target);
    const port = createBetterSqliteDbPort(target.sqlite);
    let cursor = (await loadSyncPackReceiveProgress(port, endpoint.peer.id)).progress?.cursorStateSeq ?? 0;
    const round = endpoint.peer.sqlite.prepare('SELECT high_water, source_epoch FROM sync_state_sequence').get() as {
      high_water: number; source_epoch: string };
    for (let page = 0; page < 100000; page++) {
      const mobile = process.env.FOLIOLE_SIM_PATH === 'companion' && target.name === 'b';
      const received = mobile ? await applyCompanionDesktopSyncPack({ headers: {},
        sourcePeerId: endpoint.peer.id, sourceHostName: endpoint.peer.name,
        url: `${endpoint.origin}/companion/sync-pack?page_contract=bounded-v1&after_state_seq=${cursor}` +
          `&frontier_state_seq=${round.high_water}&source_epoch=${round.source_epoch}` }) : null;
      const result = received ? { cursor: received.to_state_seq } : await downloadAndApplyDesktopSyncGroupPack({ after: cursor, peer,
        frontierStateSeq: round.high_water, sourceEpoch: round.source_epoch,
        createHeaders: createDesktopSyncGroupSignedHeaders });
      if (result.cursor < cursor || (result.cursor === cursor && cursor < round.high_water)) {
        throw new Error('simulator_cursor_no_progress');
      }
      cursor = result.cursor;
      if (cursor >= round.high_water) break;
    }
    if (cursor !== round.high_water) throw new Error('simulator_frontier_incomplete');
    await drainDesktopSyncGroupResourceArticles(peer);
    if (receipt) await flushDesktopSyncGroupVersionReceipts(peer);
    return cursor;
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
