import type http from 'node:http';

export const AGENT_CONTROL_JSON_BODY_LIMIT_BYTES = 16_384;

export type AgentControlJsonBodyResult =
  | { ok: true; value: unknown }
  | { error: string; errorCategory: string; ok: false; statusCode: number };

const preparedBodies = new WeakMap<http.IncomingMessage, AgentControlJsonBodyResult>();

export async function prepareAgentControlJsonBody(request: http.IncomingMessage) {
  const body = await readRequestBody(request);
  preparedBodies.set(request, body);
  return body;
}

export async function readAgentControlJsonBody(request: http.IncomingMessage) {
  const prepared = preparedBodies.get(request);
  if (prepared) return prepared;
  return readRequestBody(request);
}

async function readRequestBody(request: http.IncomingMessage): Promise<AgentControlJsonBodyResult> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > AGENT_CONTROL_JSON_BODY_LIMIT_BYTES) {
      return { error: 'request_body_too_large', errorCategory: 'request_body_too_large', ok: false, statusCode: 413 };
    }
    chunks.push(buffer);
  }
  try {
    const text = Buffer.concat(chunks).toString('utf8').trim();
    return { ok: true, value: text ? JSON.parse(text) : {} };
  } catch {
    return { error: 'invalid_json', errorCategory: 'invalid_json', ok: false, statusCode: 400 };
  }
}
