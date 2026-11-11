import { createServer, request as forward, type IncomingMessage, type OutgoingHttpHeaders, type ServerResponse } from 'node:http';

export function setupDav(upstream: string | undefined, intercept?: (response: ServerResponse) => boolean) {
  const files = new Map<string, Uint8Array>();
  const collections = new Set(['/']);
  const deletions: string[] = [];
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
    if (intercept?.(res)) return;
    if (req.method === 'DELETE') deletions.push(path);
    if (upstream) {
      await forwardDav(upstream, req, res, size => { uploaded += size; }, size => { downloaded += size; }, loseResponse);
      return;
    }
    if (req.method === 'MKCOL') {
      collections.add(path);
      return send(res, 201);
    }
    if (req.method === 'DELETE') {
      return send(res, deleteCollection(collections, files, path));
    }
    if (req.method === 'PROPFIND') {
      const result = propfind(collections, files, path, req.headers.depth === '0');
      return send(res, result.status, result.body);
    }
    if (req.method === 'PUT') {
      const body = await readPutBody(req, size => { uploaded += size; });
      if (!body) return;
      files.set(path, body);
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
  return { server, sandboxPath, deletions, dropNextMove: () => { loseMove = true; }, uploaded: () => uploaded, downloaded: () => downloaded };
}

async function readPutBody(req: IncomingMessage, uploaded: (size: number) => void) {
  const chunks: Buffer[] = [];
  try {
    for await (const chunk of req) { uploaded(chunk.length); chunks.push(chunk); }
  } catch (error) {
    if (req.aborted) return null;
    throw error;
  }
  return Buffer.concat(chunks);
}

function propfind(collections: Set<string>, files: Map<string, Uint8Array>, path: string, depthZero: boolean) {
  const properties = (body: string) => ({ status: 207, body });
  const file = files.get(path);
  if (file && depthZero) {
    return properties(`<D:multistatus xmlns:D="DAV:"><D:response><D:href>${path}</D:href>` +
      `<D:propstat><D:prop><D:getcontentlength>${file.byteLength}</D:getcontentlength></D:prop>` +
      '<D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response></D:multistatus>');
  }
  if (!collections.has(path)) return { status: 404 };
  const listed = [...collections, ...files.keys()].filter(name => name.startsWith(path));
  return properties(`<D:multistatus xmlns:D="DAV:">${listed.map(name =>
    `<D:response><D:href>${name}</D:href></D:response>`).join('')}</D:multistatus>`);
}

function deleteCollection(collections: Set<string>, files: Map<string, Uint8Array>, path: string) {
  if (!collections.has(path)) return 404;
  for (const name of collections) if (name.startsWith(path)) collections.delete(name);
  for (const name of files.keys()) if (name.startsWith(path)) files.delete(name);
  return 204;
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
    req.on('aborted', () => proxy.destroy());
    req.on('data', chunk => uploaded(chunk.length));
    req.pipe(proxy);
  });
}

export function busyDavGate() {
  let busy: { status: number; retryAfter: string } | undefined;
  return {
    next(status: number, retryAfter: string) { busy = { status, retryAfter }; },
    respond(response: ServerResponse) {
      if (!busy) return false;
      response.writeHead(busy.status, { 'Retry-After': busy.retryAfter }).end();
      busy = undefined;
      return true;
    }
  };
}
