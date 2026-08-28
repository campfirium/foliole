import type { IncomingMessage, ServerResponse } from 'node:http';

export function sendProviderResponse(
  response: ServerResponse,
  status: number,
  payload: unknown,
  headers: Record<string, string> = {}
) {
  response.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  response.end(JSON.stringify(payload));
}

export async function readProviderJson(request: IncomingMessage) {
  return JSON.parse(await readProviderText(request)) as Record<string, unknown>;
}

export async function readProviderText(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}
