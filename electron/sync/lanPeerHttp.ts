import http, { type IncomingMessage, type OutgoingHttpHeaders } from 'node:http';
import https from 'node:https';
import { Readable } from 'node:stream';

const NULL_BODY_STATUSES = new Set([204, 205, 304]);

/**
 * LAN peers never compress HTTP responses. Peer requests therefore bypass fetch's automatic
 * Content-Encoding decoding and refuse an encoded response before any byte reaches a decoder.
 * The property stays replaceable so process fixtures can hold the outbound peer boundary.
 */
export const lanPeerHttp: { fetch: typeof fetch } = { fetch: requestLanPeer as typeof fetch };

async function requestLanPeer(input: string | URL, init: RequestInit = {}): Promise<Response> {
  const url = new URL(String(input));
  const transport = url.protocol === 'http:' ? http : url.protocol === 'https:' ? https : null;
  if (!transport) throw new TypeError('lan_peer_protocol_unsupported');
  const signal = init.signal ?? undefined;
  signal?.throwIfAborted();
  const body = readRequestBody(init.body);
  const headers: OutgoingHttpHeaders = Object.fromEntries(new Headers(init.headers));
  if (body) headers['content-length'] = String(body.byteLength);
  const options = { headers, method: init.method ?? 'GET', ...(signal ? { signal } : {}) };
  const response = await sendRequest(transport, url, options, body);
  const encoding = response.headers['content-encoding']?.trim().toLowerCase();
  if (encoding && encoding !== 'identity') {
    response.destroy();
    throw new Error('lan_peer_response_encoding_rejected');
  }
  return toFetchResponse(response, signal);
}

function readRequestBody(body: RequestInit['body']) {
  if (body === undefined || body === null) return null;
  if (typeof body === 'string') return Buffer.from(body);
  if (body instanceof Uint8Array) return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  throw new TypeError('lan_peer_body_unsupported');
}

function sendRequest(
  transport: typeof http | typeof https,
  url: URL,
  options: { headers: OutgoingHttpHeaders; method: string; signal?: AbortSignal },
  body: Buffer | null
) {
  return new Promise<IncomingMessage>((resolve, reject) => {
    const request = transport.request(url, options, resolve);
    request.once('error', (error) => {
      reject(options.signal?.aborted ? options.signal.reason : new TypeError('fetch failed', { cause: error }));
    });
    request.end(body ?? undefined);
  });
}

function toFetchResponse(response: IncomingMessage, signal?: AbortSignal) {
  const status = response.statusCode ?? 0;
  const headers = new Headers();
  for (let index = 0; index + 1 < response.rawHeaders.length; index += 2) {
    headers.append(response.rawHeaders[index]!, response.rawHeaders[index + 1]!);
  }
  if (signal) {
    const abort = () => response.destroy(signal.reason instanceof Error ? signal.reason : undefined);
    signal.addEventListener('abort', abort, { once: true });
    response.once('close', () => signal.removeEventListener('abort', abort));
  }
  if (NULL_BODY_STATUSES.has(status)) response.resume();
  const body = NULL_BODY_STATUSES.has(status) ? null : Readable.toWeb(response) as unknown as BodyInit;
  return new Response(body, { headers, status, statusText: response.statusMessage ?? '' });
}
