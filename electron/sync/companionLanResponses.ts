import { createReadStream } from 'node:fs';
import type http from 'node:http';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import {
  createWorkgroupResponseStreamCipher, encryptWorkgroupResponse, WORKGROUP_ENVELOPE_CONTENT_TYPE
} from './workgroupHttpCrypto.js';

const ALLOWED_CORS_PROTOCOLS = new Set(['capacitor:', 'http:', 'https:']);

function resolveCorsOrigin(request: http.IncomingMessage) {
  const origin = request.headers.origin;
  if (typeof origin !== 'string' || !origin.trim()) {
    return null;
  }
  try {
    const parsedOrigin = new URL(origin);
    if (parsedOrigin.hostname === 'localhost' && ALLOWED_CORS_PROTOCOLS.has(parsedOrigin.protocol)) {
      return origin;
    }
  } catch {
    return null;
  }
  return null;
}

export function writeJson(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  statusCode: number,
  payload: unknown,
  methods = 'GET, OPTIONS, POST'
) {
  const allowedOrigin = resolveCorsOrigin(request);
  const plain = Buffer.from(JSON.stringify(payload));
  const encrypted = request.headers['x-sync-group-id']
    ? encryptWorkgroupResponse(request, plain, 'application/json; charset=utf-8') : null;
  response.writeHead(statusCode, {
    'Access-Control-Allow-Headers': 'Content-Type, X-Authorization-Id, X-Nonce, X-Signature, X-Sync-Group-Id, X-Timestamp',
    'Access-Control-Allow-Methods': methods,
    ...(allowedOrigin ? { 'Access-Control-Allow-Origin': allowedOrigin, Vary: 'Origin' } : {}),
    'Content-Type': encrypted ? WORKGROUP_ENVELOPE_CONTENT_TYPE : 'application/json; charset=utf-8',
    ...(encrypted ? { 'X-Foliole-Original-Content-Type': 'application/json; charset=utf-8' } : {})
  });
  response.end(encrypted ?? JSON.stringify(payload));
}

export function writeOptions(request: http.IncomingMessage, response: http.ServerResponse) {
  const allowedOrigin = resolveCorsOrigin(request);
  response.writeHead(204, {
    'Access-Control-Allow-Headers': 'Content-Type, X-Authorization-Id, X-Nonce, X-Signature, X-Sync-Group-Id, X-Timestamp',
    'Access-Control-Allow-Methods': 'GET, OPTIONS, POST',
    ...(allowedOrigin ? { 'Access-Control-Allow-Origin': allowedOrigin, Vary: 'Origin' } : {})
  });
  response.end();
}

export function writeBinary(response: http.ServerResponse, statusCode: number, body: Buffer, mimeType: string | null) {
  response.writeHead(statusCode, {
    'Content-Length': body.byteLength,
    'Content-Type': mimeType ?? 'application/octet-stream'
  });
  response.end(body);
}

export function writeWorkgroupBinary(
  request: http.IncomingMessage, response: http.ServerResponse, statusCode: number,
  body: Buffer, mimeType: string | null
) {
  const encrypted = encryptWorkgroupResponse(request, body, mimeType ?? 'application/octet-stream');
  response.writeHead(statusCode, {
    'Content-Length': encrypted.byteLength,
    'Content-Type': WORKGROUP_ENVELOPE_CONTENT_TYPE,
    'X-Foliole-Original-Content-Type': mimeType ?? 'application/octet-stream'
  });
  response.end(encrypted);
}

export async function writeFileStream(
  response: http.ServerResponse,
  statusCode: number,
  resource: { contentLength: number; filePath: string; mimeType: string | null }
) {
  response.writeHead(statusCode, {
    'Content-Length': resource.contentLength,
    'Content-Type': resource.mimeType ?? 'application/octet-stream'
  });
  await pipeline(createReadStream(resource.filePath), response);
}

export async function writeWorkgroupFileStream(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  statusCode: number,
  resource: { filePath: string; mimeType: string | null }
) {
  const contentType = resource.mimeType ?? 'application/octet-stream';
  const stream = createWorkgroupResponseStreamCipher(request, contentType);
  response.writeHead(statusCode, {
    'Content-Type': WORKGROUP_ENVELOPE_CONTENT_TYPE,
    'X-Foliole-Original-Content-Type': contentType
  });
  response.write(stream.prefix);
  await pipeline(createReadStream(resource.filePath), stream.cipher,
    appendAuthTag(stream.authTag), base64UrlEncoder(), response, { end: false });
  response.end(stream.suffix);
}

function appendAuthTag(read: () => Buffer) {
  return new Transform({ transform(chunk, _encoding, done) { done(null, chunk); },
    flush(done) { this.push(read()); done(); } });
}

function base64UrlEncoder() {
  let remainder = Buffer.alloc(0);
  return new Transform({
    transform(chunk, _encoding, done) {
      const body = Buffer.concat([remainder, Buffer.from(chunk)]);
      const completeLength = body.length - (body.length % 3);
      if (completeLength) this.push(body.subarray(0, completeLength).toString('base64url'));
      remainder = body.subarray(completeLength);
      done();
    },
    flush(done) { if (remainder.length) this.push(remainder.toString('base64url')); done(); }
  });
}
