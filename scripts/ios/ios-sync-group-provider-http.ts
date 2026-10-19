import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

const lifecycles = new WeakMap<Server, { stopping: boolean; responses: Set<ServerResponse> }>();

export function createProviderHttpServer(handle: (request: IncomingMessage, response: ServerResponse) => void) {
  const lifecycle = { stopping: false, responses: new Set<ServerResponse>() };
  const server = createServer((request, response) => {
    lifecycle.responses.add(response);
    const finished = () => {
      lifecycle.responses.delete(response);
      if (lifecycle.stopping && lifecycle.responses.size === 0) server.closeAllConnections();
    };
    response.once('finish', finished);
    response.once('close', finished);
    if (lifecycle.stopping) {
      sendProviderResponse(response, 503, { error: 'provider_stopping' }, { Connection: 'close' });
      return;
    }
    handle(request, response);
  });
  lifecycles.set(server, lifecycle);
  return server;
}

export async function closeProviderHttpServer(server: Server, closeSessions: () => void) {
  const lifecycle = lifecycles.get(server);
  if (!lifecycle) throw new Error('Provider HTTP lifecycle is unavailable.');
  lifecycle.stopping = true;
  closeSessions();
  await new Promise<void>((resolve) => {
    if (!server.listening) return resolve();
    server.close(() => resolve());
    if (lifecycle.responses.size === 0) server.closeAllConnections();
  });
}

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
