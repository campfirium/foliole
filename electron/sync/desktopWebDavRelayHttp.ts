import { request as httpRequest, type ClientRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

import type { WebDavRelayMethod, WebDavRelayRequest } from '../../lib/core/sync/webDavRelayPublication.js';

export type DesktopWebDavRelayHttpStats = {
  requests: Partial<Record<WebDavRelayMethod, number>>;
  responses: number;
  uploadedBytes: number;
  downloadedBytes: number;
};

export function createDesktopWebDavRelayHttp(stats: DesktopWebDavRelayHttpStats, signal?: AbortSignal): WebDavRelayRequest {
  return (url, input, receive) => {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('webdav_relay_invalid_url');
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const timeout = AbortSignal.timeout(30_000);
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    requestSignal.throwIfAborted();
    return new Promise((resolve, reject) => {
      const req = send(url, {
        method: input.method, signal: requestSignal,
        headers: { ...input.headers, 'Accept-Encoding': 'identity',
          ...(input.body ? { 'Content-Length': String(input.body.bytes) } : {}) }
      }, response => {
        stats.responses++;
        void receive(response.statusCode ?? 0, counted(response, stats)).then(resolve, error => {
          response.destroy();
          reject(error);
        });
      });
      stats.requests[input.method] = (stats.requests[input.method] ?? 0) + 1;
      req.once('error', reject);
      void writeBody(req, stats, input.body).catch(error => req.destroy(error instanceof Error ? error : undefined));
    });
  };
}

async function* counted(source: AsyncIterable<Uint8Array>, stats: DesktopWebDavRelayHttpStats) {
  for await (const chunk of source) {
    stats.downloadedBytes += chunk.byteLength;
    yield chunk;
  }
}

async function writeBody(req: ClientRequest, stats: DesktopWebDavRelayHttpStats,
  body: Parameters<WebDavRelayRequest>[1]['body']) {
  if (body) {
    let length = 0;
    for await (const chunk of body.chunks()) {
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
