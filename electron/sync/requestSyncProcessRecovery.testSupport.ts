import http from 'node:http';

import Database from 'better-sqlite3';

export function requestProcessEvidence(databasePath: string, nodeId?: string) {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const args = nodeId ? [nodeId] : [];
    return {
      nodes: db.prepare(`SELECT * FROM nodes ${nodeId ? 'WHERE id = ?' : ''} ORDER BY id`).all(...args),
      versions: db.prepare(`SELECT * FROM node_sync_versions ${nodeId ? 'WHERE object_id = ?' : ''} ORDER BY version_id`).all(...args),
      parents: db.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id, ordinal').all(),
      state: db.prepare(`SELECT * FROM sync_object_state ${nodeId ? "WHERE object_type = 'node' AND object_id = ?" : ''} ORDER BY object_type, object_id`).all(...args),
      retiredTables: db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (
        'framed_sync_inbound_transfers', 'framed_sync_inbound_attempts', 'framed_sync_inbound_frames',
        'framed_sync_receipts', 'framed_sync_blob_pins', 'framed_sync_available_blobs',
        'framed_sync_blob_chunks', 'framed_sync_outbound_publications', 'framed_sync_outbound_holds') ORDER BY name`).all()
    };
  } finally { db.close(); }
}

export async function requestProcessFaultProxy(targetOrigin: string, fault: 'corrupt_body' | 'drop_response') {
  let injected = 0;
  const server = http.createServer((request, response) => {
    void forward(request, response).catch(() => response.destroy());
  });
  async function forward(request: http.IncomingMessage, response: http.ServerResponse) {
    const url = new URL(request.url ?? '/', targetOrigin);
    const isObject = request.method === 'POST' && ['object', 'objects'].includes(url.searchParams.get('request') ?? '');
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks);
    if (isObject && fault === 'corrupt_body') {
      if (!body.length) throw new Error('request_fault_empty_body');
      body[body.length - 1] = body[body.length - 1]! ^ 1;
      injected++;
    }
    await new Promise<void>((resolve, reject) => {
      const upstream = http.request(url, { method: request.method, headers: { ...request.headers, host: url.host } }, reply => {
        reply.once('error', reject);
        reply.once('end', resolve);
        if (isObject && fault === 'drop_response' && reply.statusCode === 200) {
          injected++;
          reply.resume();
          response.destroy();
        } else {
          response.writeHead(reply.statusCode ?? 502, reply.headers);
          reply.pipe(response);
        }
      });
      upstream.once('error', reject);
      upstream.end(body);
    });
  }
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('request_fault_port_missing');
  return { origin: `http://127.0.0.1:${address.port}`, injected: () => injected,
    close: () => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }) };
}
