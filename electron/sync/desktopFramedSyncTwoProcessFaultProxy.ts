import http, { createServer } from 'node:http';

import { FRAMED_SYNC_PATH } from './companionLanFramedSyncPost.js';

export type DesktopFramedSyncFault = 'corrupt_trailer' | 'drop_receipt_response';

export async function createDesktopFramedSyncFaultProxy(input: Readonly<{
  fault: DesktopFramedSyncFault;
  targetOrigin: string;
}>) {
  const server = createServer((request, response) => {
    void forwardRequest({ ...input, request, response }).catch(() => response.destroy());
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('framed_sync_fault_proxy_port_missing');
  return {
    close: () => new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    }),
    origin: `http://127.0.0.1:${address.port}`
  };
}

async function forwardRequest(input: Readonly<{
  fault: DesktopFramedSyncFault;
  request: http.IncomingMessage;
  response: http.ServerResponse;
  targetOrigin: string;
}>) {
  const chunks: Buffer[] = [];
  for await (const chunk of input.request) chunks.push(Buffer.from(chunk));
  const body = Buffer.concat(chunks);
  const isTransfer = input.request.method === 'POST' &&
    new URL(input.request.url ?? '/', input.targetOrigin).pathname === FRAMED_SYNC_PATH;
  const forwardedBody = input.fault === 'corrupt_trailer' && isTransfer
    ? corruptFinalByte(body)
    : body;
  const target = new URL(input.request.url ?? '/', input.targetOrigin);
  const headers = { ...input.request.headers, host: target.host,
    'content-length': String(forwardedBody.byteLength) };
  delete headers['transfer-encoding'];
  await new Promise<void>((resolve, reject) => {
    const upstream = http.request(target, { headers, method: input.request.method }, (reply) => {
      if (input.fault === 'drop_receipt_response' && isTransfer) {
        reply.resume();
        input.response.destroy();
        reply.once('end', resolve);
        return;
      }
      input.response.writeHead(reply.statusCode ?? 502, reply.headers);
      reply.once('error', reject);
      reply.once('end', resolve);
      reply.pipe(input.response);
    });
    upstream.once('error', reject);
    upstream.end(forwardedBody);
  });
}

function corruptFinalByte(body: Buffer) {
  if (body.byteLength === 0) throw new Error('framed_sync_fault_body_empty');
  const corrupted = Buffer.from(body);
  const lastIndex = corrupted.byteLength - 1;
  const lastByte = corrupted[lastIndex];
  if (lastByte === undefined) throw new Error('framed_sync_fault_body_empty');
  corrupted[lastIndex] = lastByte ^ 1;
  return corrupted;
}
