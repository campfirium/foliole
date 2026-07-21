import { readFileSync } from 'node:fs';

import type { IosContentResourceAcceptanceFixture } from './ios-content-resource-acceptance-fixture.ts';

export interface IosContentResourceObservations {
  attachment_batch_requests: Record<string, number>;
  attachment_fallback_requests: Record<string, number>;
  content_batch_requests: number;
  content_requested_hashes: string[][];
}

export interface IosContentResourceResponse {
  body: Buffer;
  headers: Record<string, string>;
  status: number;
}

export function createIosContentResourceObservations(): IosContentResourceObservations {
  return {
    attachment_batch_requests: {},
    attachment_fallback_requests: {},
    content_batch_requests: 0,
    content_requested_hashes: []
  };
}

export function routeIosContentResourceRequest(args: {
  bodyText: string;
  fixture: IosContentResourceAcceptanceFixture;
  method: string;
  observations: IosContentResourceObservations;
  requestUrl: string;
}): IosContentResourceResponse | null {
  if (args.method === 'GET' && args.requestUrl === '/acceptance/sync-pack/content-resource') {
    return binary(readFileSync(args.fixture.packPath), 'application/vnd.foliole.sync-pack');
  }
  if (args.method === 'POST' && args.requestUrl === '/companion/content-blobs') {
    return contentBatchResponse(args);
  }
  if (args.method === 'GET' && args.requestUrl.startsWith('/companion/attachment-resource?')) {
    return attachmentResponse(args);
  }
  return null;
}

function contentBatchResponse(args: {
  bodyText: string;
  fixture: IosContentResourceAcceptanceFixture;
  observations: IosContentResourceObservations;
}) {
  const hashes = parseHashes(args.bodyText);
  args.observations.content_batch_requests += 1;
  args.observations.content_requested_hashes.push(hashes);
  const boundary = `foliole-ios-acceptance-${args.observations.content_batch_requests}`;
  const entries = hashes.flatMap((hash) => {
    const entry = Object.values(args.fixture.contentBlobs).find((candidate) => candidate.hash === hash);
    if (!entry || entry === args.fixture.contentBlobs.missing) return [];
    const bytes = entry === args.fixture.contentBlobs.corrupt ? Buffer.from('corrupt-delivery') : entry.bytes;
    return [multipartPart(boundary, hash, entry.mimeType, bytes)];
  });
  return {
    body: Buffer.concat([...entries, Buffer.from(`--${boundary}--\r\n`)]),
    headers: { 'Content-Type': `multipart/mixed; boundary=${boundary}` },
    status: 200
  };
}

function attachmentResponse(args: {
  fixture: IosContentResourceAcceptanceFixture;
  observations: IosContentResourceObservations;
  requestUrl: string;
}) {
  const url = new URL(args.requestUrl, 'http://127.0.0.1');
  const attachmentId = url.searchParams.get('attachment_id') ?? '';
  const contentHash = url.searchParams.get('content_hash') ?? '';
  const attachment = Object.values(args.fixture.attachments).find((candidate) => candidate.id === attachmentId);
  recordAttachmentRequest(args.observations, attachmentId);
  if (!attachment || attachment.hash !== contentHash || attachment === args.fixture.attachments.missing) {
    return jsonError(404, 'attachment_not_found');
  }
  if (attachment === args.fixture.attachments.failed) return jsonError(503, 'acceptance_failure');
  const bytes = attachment === args.fixture.attachments.corrupt ? Buffer.from('corrupt-delivery') : attachment.bytes;
  return binary(bytes, attachment.mimeType);
}

function recordAttachmentRequest(observations: IosContentResourceObservations, attachmentId: string) {
  const batchCount = observations.attachment_batch_requests[attachmentId] ?? 0;
  const fallbackCount = observations.attachment_fallback_requests[attachmentId] ?? 0;
  if (batchCount === 0) observations.attachment_batch_requests[attachmentId] = 1;
  else observations.attachment_fallback_requests[attachmentId] = fallbackCount + 1;
}

function parseHashes(bodyText: string) {
  try {
    const value = JSON.parse(bodyText) as { hashes?: unknown };
    return Array.isArray(value.hashes) ? value.hashes.filter((hash): hash is string => typeof hash === 'string') : [];
  } catch {
    return [];
  }
}

function multipartPart(boundary: string, hash: string, mimeType: string, bytes: Buffer) {
  return Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\nContent-Length: ${bytes.length}\r\n`),
    Buffer.from(`X-Blob-Hash: ${hash}\r\n\r\n`),
    bytes,
    Buffer.from('\r\n')
  ]);
}

function binary(body: Buffer, mimeType: string): IosContentResourceResponse {
  return { body, headers: { 'Content-Type': mimeType }, status: 200 };
}

function jsonError(status: number, error: string): IosContentResourceResponse {
  return {
    body: Buffer.from(JSON.stringify({ error })),
    headers: { 'Content-Type': 'application/json' },
    status
  };
}
