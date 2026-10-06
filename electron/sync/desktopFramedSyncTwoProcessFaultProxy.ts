import http, { createServer } from 'node:http';

import { FRAMED_SYNC_LIMITS } from '../../lib/core/sync/framedSyncContract.js';
import { decodeFramedSyncPreamble } from '../../lib/core/sync/framedSyncFraming.js';

import { FRAMED_SYNC_PATH } from './companionLanFramedSyncPost.js';

export type DesktopFramedSyncFault = 'corrupt_trailer' | 'drop_receipt_response' | 'observe';

export async function createDesktopFramedSyncFaultProxy(input: Readonly<{
  fault: DesktopFramedSyncFault;
  targetOrigin: string;
  dropReceiptResponseAt?: number;
}>) {
  let transferCount = 0;
  const wire = { sessionBytes: 0, transferBytes: 0 };
  const server = createServer((request, response) => {
    void forwardRequest({ ...input, request, response,
      recordBytes: (count, isTransfer) => {
        if (isTransfer) wire.transferBytes += count;
        else wire.sessionBytes += count;
      },
      shouldDropReceipt: () => {
        transferCount += 1;
        return input.dropReceiptResponseAt === undefined || transferCount === input.dropReceiptResponseAt;
      }
    }).catch(() => response.destroy());
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
    origin: `http://127.0.0.1:${address.port}`,
    wireBytes: () => ({ ...wire })
  };
}

async function forwardRequest(input: Readonly<{
  fault: DesktopFramedSyncFault;
  request: http.IncomingMessage;
  response: http.ServerResponse;
  targetOrigin: string;
  shouldDropReceipt: () => boolean;
  recordBytes: (count: number, isTransfer: boolean) => void;
}>) {
  const chunks: Buffer[] = [];
  for await (const chunk of input.request) chunks.push(Buffer.from(chunk));
  const body = Buffer.concat(chunks);
  const isTransfer = input.request.method === 'POST' &&
    new URL(input.request.url ?? '/', input.targetOrigin).pathname === FRAMED_SYNC_PATH &&
    decodeFramedSyncPreamble(body.subarray(0, FRAMED_SYNC_LIMITS.preambleBytes)).contextKind === 'transfer';
  const dropReceipt = isTransfer && input.shouldDropReceipt();
  const forwardedBody = input.fault === 'corrupt_trailer' && isTransfer
    ? corruptFinalByte(body)
    : body;
  input.recordBytes(forwardedBody.byteLength, isTransfer);
  const target = new URL(input.request.url ?? '/', input.targetOrigin);
  const headers = { ...input.request.headers, host: target.host,
    'content-length': String(forwardedBody.byteLength) };
  delete headers['transfer-encoding'];
  await new Promise<void>((resolve, reject) => {
    const upstream = http.request(target, { headers, method: input.request.method }, (reply) => {
      reply.on('data', (chunk: Buffer) => input.recordBytes(chunk.byteLength, isTransfer));
      if (input.fault === 'drop_receipt_response' && dropReceipt) {
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
