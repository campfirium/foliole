import { createServer } from 'node:http';

export async function withWebDavFixture(corrupt: boolean, run: (url: string, files: Map<string, string>) => Promise<void>) {
  const files = new Map<string, string>([['/relay/keep.bin', 'existing']]);
  const server = createServer(async (request, response) => {
    const path = request.url ?? '';
    if (request.method === 'PROPFIND' && path === '/relay/') {
      return response.writeHead(207).end();
    }
    if (request.method === 'PUT') {
      let body = '';
      for await (const chunk of request) body += chunk.toString();
      files.set(path, body);
      return response.writeHead(201).end();
    }
    if (request.method === 'MOVE' && files.has(path)) {
      const header = request.headers.destination;
      if (typeof header !== 'string') return response.writeHead(400).end();
      const destination = new URL(header).pathname;
      files.set(destination, files.get(path) ?? '');
      files.delete(path);
      return response.writeHead(201).end();
    }
    if (request.method === 'DELETE') return response.writeHead(files.delete(path) ? 204 : 404).end();
    if (request.method === 'GET' && files.has(path)) {
      return response.writeHead(200).end(corrupt ? 'wrong bytes' : files.get(path));
    }
    return response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected an HTTP address.');
    await run(`http://127.0.0.1:${address.port}/relay`, files);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}
