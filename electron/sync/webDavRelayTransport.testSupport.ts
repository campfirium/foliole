import { createServer, request as forward, type IncomingMessage, type OutgoingHttpHeaders, type ServerResponse } from 'node:http';

export function setupDav(upstream: string | undefined) {
  const files = new Map<string, Uint8Array>();
  const collections = new Set(['/']);
  let loseMove = false;
  const loseResponse = () => {
    const drop = loseMove;
    loseMove = false;
    return drop;
  };
  let uploaded = 0;
  let downloaded = 0;
  const send = (res: ServerResponse, status: number, body: Uint8Array | string = '') => {
    downloaded += Buffer.byteLength(body);
    res.writeHead(status).end(body);
  };
  const server = createServer(async (req, res) => {
    const path = req.url!;
    if (upstream) {
      await forwardDav(upstream, req, res, size => { uploaded += size; }, size => { downloaded += size; }, loseResponse);
      return;
    }
    if (req.method === 'MKCOL') {
      collections.add(path);
      return send(res, 201);
    }
    if (req.method === 'PROPFIND') {
      if (!collections.has(path)) return send(res, 404);
      const listed = [...files.keys()].filter(name => name.startsWith(path));
      return send(res, 207, `<D:multistatus xmlns:D="DAV:">${listed.map(name =>
        `<D:response><D:href>${name}</D:href></D:response>`).join('')}</D:multistatus>`);
    }
    if (req.method === 'PUT') {
      const chunks: Buffer[] = [];
      for await (const chunk of req) { uploaded += chunk.length; chunks.push(chunk); }
      files.set(path, Buffer.concat(chunks));
      return send(res, 201);
    }
    if (req.method === 'MOVE') {
      const destination = req.headers.destination;
      if (typeof destination !== 'string' || !files.has(path)) return send(res, 404);
      const target = new URL(destination).pathname;
      if (files.has(target)) return send(res, 412);
      files.set(target, files.get(path)!);
      files.delete(path);
      if (loseResponse()) req.socket.destroy();
      else send(res, 201);
      return;
    }
    const body = files.get(path);
    send(res, body ? 200 : 404, body);
  });
  const sandboxPath = upstream ? new URL(upstream).pathname : '/';
  return { server, sandboxPath, dropNextMove: () => { loseMove = true; }, uploaded: () => uploaded, downloaded: () => downloaded };
}

async function forwardDav(upstream: string, req: IncomingMessage, res: ServerResponse,
  uploaded: (size: number) => void, downloaded: (size: number) => void, shouldDrop: () => boolean) {
  const url = new URL(req.url!, upstream);
  const headers: OutgoingHttpHeaders = { ...req.headers, host: url.host };
  if (typeof headers.destination === 'string') {
    headers.destination = new URL(new URL(headers.destination).pathname, upstream).href;
  }
  await new Promise<void>(resolve => {
    const proxy = forward(url, { method: req.method, headers }, async response => {
      try {
        const loseResponse = req.method === 'MOVE' && response.statusCode === 201 && shouldDrop();
        if (!loseResponse) res.writeHead(response.statusCode!, response.headers);
        for await (const chunk of response) {
          if (!loseResponse) { downloaded(chunk.length); res.write(chunk); }
        }
        if (loseResponse) res.destroy();
        else res.end();
      } catch {
        res.destroy();
      } finally { resolve(); }
    });
    proxy.on('error', () => { res.destroy(); resolve(); });
    req.on('data', chunk => uploaded(chunk.length));
    req.pipe(proxy);
  });
}
