import type { IncomingMessage, ServerResponse } from 'node:http';

const WORKGROUP_ENVELOPE_CONTENT_TYPE = 'application/vnd.foliole.workgroup-aead+json';

interface ResponseEncryptor {
  encryptResponse(request: IncomingMessage, body: Buffer, contentType: string): Buffer;
}

export function sendSignedProviderJson(
  encryptor: ResponseEncryptor, request: IncomingMessage, response: ServerResponse,
  status: number, payload: unknown, headers: Record<string, string> = {}
) {
  sendSignedProviderResponse(
    encryptor, request, response, status, Buffer.from(JSON.stringify(payload)), 'application/json', headers
  );
}

export function sendSignedProviderResponse(
  encryptor: ResponseEncryptor, request: IncomingMessage, response: ServerResponse,
  status: number, body: Buffer, contentType: string, headers: Record<string, string> = {}
) {
  const encrypted = encryptor.encryptResponse(request, body, contentType);
  response.writeHead(status, {
    ...headers,
    'Content-Length': String(encrypted.byteLength),
    'Content-Type': WORKGROUP_ENVELOPE_CONTENT_TYPE,
    'X-Foliole-Original-Content-Type': contentType
  });
  response.end(encrypted);
}
