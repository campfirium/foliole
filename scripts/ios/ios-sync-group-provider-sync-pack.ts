import type { IncomingMessage, ServerResponse } from 'node:http';

import type { createIosSyncGroupProviderContract } from './ios-sync-group-provider-contract.ts';
import { sendSignedProviderResponse } from './ios-sync-group-provider-response.ts';
import type { IosSyncPackAcceptanceRoutes } from './ios-sync-pack-acceptance-routes.ts';

export async function routeIosSyncPackProviderRequest(args: {
  bodyText: string;
  onObserved: () => void;
  provider: ReturnType<typeof createIosSyncGroupProviderContract>;
  request: IncomingMessage;
  response: ServerResponse;
  service: IosSyncPackAcceptanceRoutes | null;
}) {
  if (!args.service) return false;
  const routed = await args.service.route({
    bodyText: args.bodyText,
    method: args.request.method ?? 'GET',
    url: args.request.url ?? '/'
  });
  if (!routed) return false;
  sendSignedProviderResponse(
    args.provider, args.request, args.response, 200, routed.body, routed.contentType
  );
  args.onObserved();
  return true;
}
