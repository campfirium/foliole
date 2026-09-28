import type http from 'node:http';

import { loadCompanionAttachmentResource } from './companionLanAttachmentResources.js';
import { writeJson, writeWorkgroupFileStream } from './companionLanResponses.js';

export async function handleCompanionAttachmentGet(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  parsedRequestUrl: URL
) {
  const params = parsedRequestUrl.searchParams;
  const hasRange = params.has('offset') || params.has('length');
  const resource = await loadCompanionAttachmentResource(
    params.get('attachment_id'), params.get('content_hash'),
    hasRange ? { offset: params.get('offset'), length: params.get('length') } : undefined
  );
  if (resource.status === 'ready') {
    await writeWorkgroupFileStream(request, response, 200, resource);
  } else {
    writeJson(request, response, resource.statusCode, { error: resource.error }, 'GET, OPTIONS');
  }
}
