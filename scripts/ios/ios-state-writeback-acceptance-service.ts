import { readFileSync } from 'node:fs';

import { acceptIosAcceptancePush } from './ios-acceptance-mechanical-push.ts';
import { createIosStateWritebackObservations } from './ios-state-writeback-acceptance-observations.ts';

export { createIosStateWritebackObservations };

export async function createIosStateWritebackAcceptanceService(args: {
  observations: ReturnType<typeof createIosStateWritebackObservations>;
  outputDirectory: string;
  packPaths: { initial: string; steady: string };
}) {
  return {
    route: async (request: { bodyText: string; method: string; url: string }) => {
      if (request.method === 'GET' && request.url === '/companion/diagnostics/sync') {
        return {
          body: JSON.stringify({ sync_state: { max_state_seq: 1 } }),
          contentType: 'application/json'
        };
      }
      if (request.method === 'POST' && request.url === '/companion/sync-push') {
        const payload = JSON.parse(request.bodyText) as {
          items?: Array<{ identity?: { objectType?: string }; payloadJson?: unknown }>;
        };
        args.observations.push_requests += 1;
        args.observations.pushed_object_types.push(...(payload.items ?? [])
          .map((item) => item.identity?.objectType ?? 'invalid'));
        args.observations.last_push_items = (payload.items ?? []).map((item) => ({
          object_type: item.identity?.objectType ?? 'invalid',
          payload_json: item.payloadJson ?? null
        }));
        const result = { acks: acceptIosAcceptancePush(request.bodyText).acks };
        args.observations.ack_statuses.push(...result.acks.map((ack) => ack.status));
        return { body: JSON.stringify(result), contentType: 'application/json' };
      }
      if (request.method !== 'GET' || !request.url.startsWith('/companion/sync-pack?')) return null;
      const fromStateSeq = Number(new URL(request.url, 'http://acceptance').searchParams.get('after_state_seq') ?? 0);
      const packPath = fromStateSeq === 0 ? args.packPaths.initial : args.packPaths.steady;
      args.observations.pack_requests += 1;
      return { body: readFileSync(packPath), contentType: 'application/vnd.foliole.sync-pack' };
    },
    close: () => undefined
  };
}
