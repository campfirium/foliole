import { createReadStream } from 'node:fs';
import type http from 'node:http';
import { pipeline } from 'node:stream/promises';

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
  response.writeHead(statusCode, {
    'Access-Control-Allow-Headers': 'Content-Type, X-Device-Id, X-Nonce, X-Signature, X-Timestamp',
    'Access-Control-Allow-Methods': methods,
    ...(allowedOrigin ? { 'Access-Control-Allow-Origin': allowedOrigin, Vary: 'Origin' } : {}),
    'Content-Type': 'application/json; charset=utf-8'
  });
  response.end(JSON.stringify(payload));
}

export function writeOptions(request: http.IncomingMessage, response: http.ServerResponse) {
  const allowedOrigin = resolveCorsOrigin(request);
  response.writeHead(204, {
    'Access-Control-Allow-Headers': 'Content-Type, X-Device-Id, X-Nonce, X-Signature, X-Timestamp',
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
