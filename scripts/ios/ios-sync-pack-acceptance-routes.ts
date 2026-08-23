import { readFileSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import path from 'node:path';

import { loadIosAcceptanceContractCorpus } from './ios-acceptance-contract-corpus.ts';
import { acceptIosAcceptancePush } from './ios-acceptance-mechanical-push.ts';
import { createIosSyncPackAcceptanceObservations } from './ios-sync-pack-acceptance-observations.ts';

export async function createIosSyncPackAcceptanceRoutes(args: {
  observations: ReturnType<typeof createIosSyncPackAcceptanceObservations>;
  outputDirectory?: string;
  toPeerId?: string;
}) {
  const fixtureDirectory = loadIosAcceptanceContractCorpus().syncPackDirectory;
  const staticRoutes: Record<string, string> = {
    '/acceptance/sync-pack/corrupt-envelope': path.join(fixtureDirectory, 'corrupt-envelope.syncpack'),
    '/acceptance/sync-pack/cursor-gap': path.join(fixtureDirectory, 'cursor-gap.syncpack'),
    '/acceptance/sync-pack/illegal-dag': path.join(fixtureDirectory, 'illegal-dag.syncpack'),
    '/acceptance/sync-pack/legacy-format': path.join(fixtureDirectory, 'legacy-format.syncpack'),
    '/acceptance/sync-pack/legal': path.join(fixtureDirectory, 'legal.syncpack'),
    '/acceptance/sync-pack/wrong-target': path.join(fixtureDirectory, 'wrong-target.syncpack')
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
      ? path.join(fixtureDirectory, 'successor.syncpack')
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
