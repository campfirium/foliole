import { createHash } from 'node:crypto';

import { decryptWorkgroupPayloadNode } from '../../electron/sync/workgroupAeadNode.js';

import { native } from './companionRequestSync.testSupport.js';

export function installSessionHttpBoundary() {
  native.http.mockImplementation(async (input: { url: string; method: string; headers: Record<string, string> }) => {
    const response = await fetch(input.url, { method: input.method, headers: input.headers });
    const url = new URL(input.url);
    const body = decryptWorkgroupPayloadNode({
      context: { contentType: 'application/json; charset=utf-8', direction: 'response', method: input.method,
        pathWithQuery: `${url.pathname}${url.search}`,
        groupTag: createHash('sha256').update(Buffer.alloc(32, 7)).digest('hex').slice(0, 32) },
      envelope: await response.json(), groupKey: Buffer.alloc(32, 7).toString('base64url')
    });
    return { status: response.status, body: body.toString('utf8') };
  });
}
