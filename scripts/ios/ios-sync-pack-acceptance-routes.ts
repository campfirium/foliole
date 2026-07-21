import { readFileSync } from 'node:fs';
import type { ServerResponse } from 'node:http';

import { handleCompanionSyncPushWithApply } from '../../electron/sync/companionLanSyncPushWithApply.ts';

import { createIosSyncPackAcceptanceFixture } from './ios-sync-pack-acceptance-fixture.ts';
import { createIosSyncPackAcceptanceObservations } from './ios-sync-pack-acceptance-observations.ts';

export async function createIosSyncPackAcceptanceRoutes(args: {
  observations: ReturnType<typeof createIosSyncPackAcceptanceObservations>;
  outputDirectory: string;
  toPeerId: string;
}) {
  const fixture = await createIosSyncPackAcceptanceFixture(args);
  const staticRoutes: Record<string, string> = {
    '/acceptance/sync-pack/corrupt-envelope': fixture.corruptEnvelopePath,
    '/acceptance/sync-pack/cursor-gap': fixture.cursorGapPath,
    '/acceptance/sync-pack/illegal-dag': fixture.illegalDagPath,
    '/acceptance/sync-pack/legacy-format': fixture.legacyFormatPath,
    '/acceptance/sync-pack/legal': fixture.legalPath,
    '/acceptance/sync-pack/wrong-target': fixture.wrongTargetPath
  };
  let successorReady = false;
  const route = async (request: { bodyText: string; method: string; url: string }) => {
    if (request.method === 'POST' && request.url === '/companion/sync-push') {
      args.observations.push_requests += 1;
      const result = await handleCompanionSyncPushWithApply(request.bodyText, fixture.apply, () => undefined);
      args.observations.ack_statuses.push(...result.acks.map((ack) => ack.status));
      args.observations.pushed_node_ids.push(...result.acks.map((ack) => ack.identity.objectId));
      args.observations.pushed_version_ids.push(...result.acks.flatMap((ack) => ack.version_id ? [ack.version_id] : []));
      if (!successorReady) {
        const prepared = await fixture.buildSuccessorPack(args.observations.pushed_node_ids);
        args.observations.capture_node_id = prepared.captureNodeId;
        args.observations.desktop = prepared.desktop;
        successorReady = true;
      }
      return { body: Buffer.from(JSON.stringify(result)), contentType: 'application/json' };
    }
    if (request.method !== 'GET') return null;
    const filePath = request.url === '/acceptance/sync-pack/successor' && successorReady
      ? fixture.successorPath
      : staticRoutes[request.url];
    return filePath
      ? { body: readFileSync(filePath), contentType: 'application/vnd.foliole.sync-pack' }
      : null;
  };
  return {
    close: fixture.close,
    handle: async (request: { bodyText: string; method: string; url: string }, response: ServerResponse) => {
      const routed = await route(request);
      if (!routed) return false;
      response.writeHead(200, { 'Content-Type': routed.contentType });
      response.end(routed.body);
      return true;
    }
  };
}

export type IosSyncPackAcceptanceRoutes = Awaited<ReturnType<typeof createIosSyncPackAcceptanceRoutes>>;
