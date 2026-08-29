import { readFileSync } from 'node:fs';
import type { ServerResponse } from 'node:http';

import { acceptIosAcceptancePush } from './ios-acceptance-mechanical-push.ts';
import { createIosSyncPackAcceptanceObservations } from './ios-sync-pack-acceptance-observations.ts';

export async function createIosSyncPackAcceptanceRoutes(args: {
  observations: ReturnType<typeof createIosSyncPackAcceptanceObservations>;
  outputDirectory?: string;
  packPaths: {
    cursorGap: string;
    legal: string;
    successor: string;
    wrongTarget: string;
  };
}) {
  const staticRoutes: Record<string, string> = {
    '/acceptance/sync-pack/cursor-gap': args.packPaths.cursorGap,
    '/acceptance/sync-pack/legal': args.packPaths.legal,
    '/acceptance/sync-pack/wrong-target': args.packPaths.wrongTarget
  };
  let successorReady = false;
  const route = async (request: { bodyText: string; method: string; url: string }) => {
    if (request.method === 'POST' && request.url === '/companion/sync-push') {
      args.observations.push_requests += 1;
      const { acks, items } = acceptIosAcceptancePush(request.bodyText);
      const result = { acks };
      args.observations.pushed_payload_json.push(...items.map((item) => item.payloadJson));
      args.observations.ack_statuses.push(...result.acks.map((ack) => ack.status));
      args.observations.pushed_node_ids.push(...result.acks.map((ack) => ack.identity.objectId));
      args.observations.pushed_version_ids.push(...result.acks.flatMap((ack) => ack.version_id ? [ack.version_id] : []));
      args.observations.capture_node_id = items.find((item) => item.identity.objectId !== 'ios-acceptance-restore')
        ?.identity.objectId ?? null;
      successorReady = true;
      return { body: Buffer.from(JSON.stringify(result)), contentType: 'application/json' };
    }
    if (request.method !== 'GET') return null;
    const pathname = new URL(request.url, 'http://acceptance').pathname;
    const filePath = pathname === '/acceptance/sync-pack/successor' && successorReady
      ? args.packPaths.successor
      : staticRoutes[pathname];
    return filePath
      ? { body: readFileSync(filePath), contentType: 'application/vnd.foliole.sync-pack' }
      : null;
  };
  return {
    close: () => undefined,
    handle: async (request: { bodyText: string; method: string; url: string }, response: ServerResponse) => {
      args.observations.request_urls.push(request.url);
      const routed = await route(request);
      if (!routed) return false;
      response.writeHead(200, {
        'Content-Length': String(routed.body.byteLength),
        'Content-Type': routed.contentType
      });
      response.end(routed.body);
      return true;
    }
  };
}

export type IosSyncPackAcceptanceRoutes = Awaited<ReturnType<typeof createIosSyncPackAcceptanceRoutes>>;
