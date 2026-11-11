import { request as httpRequest, type ClientRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

import type { WebDavRelayMethod, WebDavRelayRequest } from '../../lib/core/sync/webDavRelayPublication.js';
import { consumeWebDavResponse } from '../../lib/core/sync/webDavRetryAfter.js';

import type { WebDavUsageRecord } from './desktopWebDavUsage.js';

export type DesktopWebDavRelayHttpStats = {
  requests: Partial<Record<WebDavRelayMethod, number>>;
  responses: number;
  httpStatuses?: Partial<Record<WebDavRelayMethod, Partial<Record<number, number>>>>;
  uploadedBytes: number;
  downloadedBytes: number;
};

export function createDesktopWebDavRelayHttp(stats: DesktopWebDavRelayHttpStats, signal?: AbortSignal, options?: {
  timeoutMs?: number;
  recordUsage?: (record: WebDavUsageRecord) => Promise<void>;
}): WebDavRelayRequest {
  return async (url, input, receive) => {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('webdav_relay_invalid_url');
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const timeout = AbortSignal.timeout(options?.timeoutMs ?? 30_000);
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    requestSignal.throwIfAborted();
    const bytes = { uploadedBytes: 0, downloadedBytes: 0 };
    let attempted = false;
    try {
      return await new Promise((resolve, reject) => {
        const req = send(url, {
          method: input.method, signal: requestSignal,
          headers: { ...input.headers, 'Accept-Encoding': 'identity',
            ...(input.body ? { 'Content-Length': String(input.body.bytes) } : {}) }
        }, response => {
          stats.responses++;
          const status = response.statusCode ?? 0;
          if (stats.httpStatuses) {
            const statuses = stats.httpStatuses[input.method] ??= {};
            statuses[status] = (statuses[status] ?? 0) + 1;
          }
          void consumeWebDavResponse(status, response.headers['retry-after'], counted(response, bytes), receive).then(resolve, error => {
            response.destroy();
            reject(error);
          });
        });
        attempted = true;
        stats.requests[input.method] = (stats.requests[input.method] ?? 0) + 1;
        req.once('error', reject);
        void writeBody(req, bytes, input.body).catch(error => req.destroy(error instanceof Error ? error : undefined));
      });
    } finally {
      stats.uploadedBytes += bytes.uploadedBytes;
      stats.downloadedBytes += bytes.downloadedBytes;
      if (attempted) await options?.recordUsage?.({ endedAt: Date.now(), ...bytes });
    }
  };
}

async function* counted(source: AsyncIterable<Uint8Array>, stats: Pick<WebDavUsageRecord, 'downloadedBytes'>) {
  for await (const chunk of source) {
    stats.downloadedBytes += chunk.byteLength;
    yield chunk;
  }
}

async function writeBody(req: ClientRequest, stats: Pick<WebDavUsageRecord, 'uploadedBytes'>,
  body: Parameters<WebDavRelayRequest>[1]['body']) {
  if (body) {
    let length = 0;
    for await (const chunk of body.chunks()) {
      if (chunk.byteLength === 0) continue;
      length += chunk.byteLength;
      if (length > body.bytes) throw new Error('webdav_relay_upload_length_invalid');
      await new Promise<void>((resolve, reject) => req.write(chunk, error => {
        if (error) { reject(error); return; }
        stats.uploadedBytes += chunk.byteLength;
        resolve();
      }));
    }
    if (length !== body.bytes) throw new Error('webdav_relay_upload_length_invalid');
  }
  req.end();
}
