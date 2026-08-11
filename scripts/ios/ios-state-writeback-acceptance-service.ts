import { readFileSync } from 'node:fs';

import { handleCompanionSyncPushWithApply } from '../../electron/sync/companionLanSyncPushWithApply.ts';

import { createIosStateWritebackAcceptanceFixture } from './ios-state-writeback-acceptance-fixture.ts';
import { createIosStateWritebackObservations } from './ios-state-writeback-acceptance-observations.ts';

export { createIosStateWritebackObservations };

export async function createIosStateWritebackAcceptanceService(args: {
  observations: ReturnType<typeof createIosStateWritebackObservations>;
  outputDirectory: string;
  toPeerId: string;
}) {
  const fixture = await createIosStateWritebackAcceptanceFixture(args);
  return {
    close: fixture.close,
    route: async (request: { bodyText: string; method: string; url: string }) => {
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
        const result = await handleCompanionSyncPushWithApply(
          request.bodyText,
          args.toPeerId,
          fixture.apply,
          () => undefined
        );
        args.observations.ack_statuses.push(...result.acks.map((ack) => ack.status));
        return { body: JSON.stringify(result), contentType: 'application/json' };
      }
      if (request.method !== 'GET' || !request.url.startsWith('/companion/sync-pack?')) return null;
      const fromStateSeq = Number(new URL(request.url, 'http://acceptance').searchParams.get('after_state_seq') ?? 0);
      const packPath = await fixture.buildConfirmationPack(fromStateSeq);
      args.observations.pack_requests += 1;
      return { body: readFileSync(packPath), contentType: 'application/vnd.foliole.sync-pack' };
    }
  };
}
