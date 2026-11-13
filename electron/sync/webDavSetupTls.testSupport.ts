import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer } from 'node:https';
import path from 'node:path';

export const fixtureCredentials = { username: 'fixture', password: 'test-password' };
const AUTH = `Basic ${Buffer.from(`${fixtureCredentials.username}:${fixtureCredentials.password}`).toString('base64')}`;
const PARENT = '/storage/';
const PROBE = /^\/storage\/[^/]+\/\.foliole-test-[\w-]+\.(?:tmp|dat)$/;

function createCertificate(root: string) {
  mkdirSync(root, { recursive: true });
  const key = path.join(root, 'webdav-fixture.key');
  const cert = path.join(root, 'webdav-fixture.pem');
  const config = path.join(root, 'webdav-fixture.cnf');
  writeFileSync(config, '[req]\ndistinguished_name=dn\n[dn]\n[extensions]\nsubjectAltName=IP:127.0.0.1\n');
  execFileSync('/usr/bin/openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=WebDAV Test Fixture', '-config', config, '-extensions', 'extensions', '-keyout', key, '-out', cert],
  { stdio: 'ignore' });
  return { key: readFileSync(key), cert: readFileSync(cert, 'utf8') };
}

async function storeProbe(request: IncomingMessage, response: ServerResponse, files: Map<string, string>, url: string) {
  let body = '';
  for await (const chunk of request) body += chunk.toString();
  files.set(url, body);
  response.writeHead(201).end();
}

export async function startWebDavSetupFixture(root: string) {
  const tls = createCertificate(root);
  const directories = new Set([PARENT, `${PARENT}occupied/`]);
  const files = new Map([[`${PARENT}keep.bin`, 'parent file'], [`${PARENT}occupied/keep.bin`, 'existing file']]);
  const requests: string[] = [];
  const server = createServer(tls, async (request, response) => {
    const url = request.url ?? '';
    requests.push(`${request.method} ${url}`);
    if (request.headers.authorization !== AUTH) return response.writeHead(401).end();
    if (request.method === 'PROPFIND') return response.writeHead(directories.has(url) ? 207 : 404).end();
    if (request.method === 'MKCOL') {
      if (directories.has(url)) return response.writeHead(405).end();
      if (url === `${PARENT}denied/`) return response.writeHead(403).end();
      if (!/^\/storage\/[^/]+\/$/.test(url)) return response.writeHead(409).end();
      directories.add(url);
      return response.writeHead(201).end();
    }
    if (!PROBE.test(url) || !directories.has(url.slice(0, url.lastIndexOf('/') + 1))) return response.writeHead(404).end();
    if (request.method === 'PUT') {
      if (url.startsWith(`${PARENT}read-only/`)) return response.writeHead(403).end();
      return storeProbe(request, response, files, url);
    }
    if (request.method === 'MOVE' && files.has(url)) {
      const target = new URL(String(request.headers.destination)).pathname;
      if (!PROBE.test(target) || files.has(target)) return response.writeHead(412).end();
      files.set(target, files.get(url)!);
      files.delete(url);
      return response.writeHead(201).end();
    }
    if (request.method === 'GET' && files.has(url)) return response.writeHead(200).end(files.get(url));
    if (request.method === 'DELETE') return response.writeHead(files.delete(url) ? 204 : 404).end();
    return response.writeHead(404).end();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TLS fixture address.');
  return {
    cert: tls.cert, parent: `https://127.0.0.1:${address.port}${PARENT}`, requests, directories, files,
    close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  };
}
