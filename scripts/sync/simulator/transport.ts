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
  return inPeer(target, async () => {
    const peer = route(endpoint, target);
    const port = createBetterSqliteDbPort(target.sqlite);
    const { progress } = await loadSyncPackReceiveProgress(port, endpoint.peer.id);
    let cursor = progress?.cursorStateSeq ?? 0;
    let frontier = progress && !progress.completed ? progress.frontierStateSeq : undefined;
    let epoch = progress && !progress.completed ? progress.sourceEpoch : undefined;
    for (let page = 0; page < 100000; page++) {
      const mobile = process.env.FOLIOLE_SIM_PATH === 'companion' && target.name === 'b';
      const received = mobile ? await applyCompanionDesktopSyncPack({ headers: {},
        sourcePeerId: endpoint.peer.id, sourceHostName: endpoint.peer.name,
        url: `${endpoint.origin}/companion/sync-pack?page_contract=bounded-v1&after_state_seq=${cursor}` +
          (frontier === undefined ? '' : `&frontier_state_seq=${frontier}`) +
          (epoch === undefined ? '' : `&source_epoch=${epoch}`) }) : null;
      const result = received ? { cursor: received.to_state_seq, frontierStateSeq: received.frontier_state_seq,
        sourceEpoch: received.source_epoch, roundRebased: received.round_rebased } : await downloadAndApplyDesktopSyncGroupPack({ after: cursor, peer,
        ...(frontier === undefined ? {} : { frontierStateSeq: frontier }),
        ...(epoch === undefined ? {} : { sourceEpoch: epoch }),
        createHeaders: createDesktopSyncGroupSignedHeaders });
      if (result.roundRebased) {
        if (epoch && result.sourceEpoch !== epoch) throw new Error('sync_pack_source_epoch_changed');
        frontier = result.frontierStateSeq;
      }
      frontier ??= result.frontierStateSeq ?? result.cursor;
      epoch ??= result.sourceEpoch;
      if (result.frontierStateSeq !== undefined && result.frontierStateSeq !== frontier ||
          result.sourceEpoch !== undefined && result.sourceEpoch !== epoch || result.cursor > frontier) {
        throw new Error('sync_pack_round_changed');
      }
      if (result.cursor < cursor || (result.cursor === cursor && cursor < frontier)) {
        throw new Error('simulator_cursor_no_progress');
      }
      cursor = result.cursor;
      if (cursor === frontier) break;
    }
    if (cursor !== frontier) throw new Error('simulator_frontier_incomplete');
    try { await drainDesktopSyncGroupResourceArticles(peer); }
    catch (error) {
      if (!missingKeys.size || !(error instanceof Error) || error.message !== 'sync_group_resources_incomplete') throw error;
      const pending = target.sqlite.prepare('SELECT count(*) FROM sync_pack_resource_articles').pluck().get();
      if (!pending) throw error;
      await assertCompleted(target, missingKeys);
      operations.push({ action: 'expected-resource-partial', peer: target.name, missingKeys: [...missingKeys] });
    }
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
