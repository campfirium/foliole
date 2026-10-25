// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { createCompanionPreviewDocument } from '../../scripts/vite/companionPreviewDocument';
import { handleCompanionPreviewSqlite } from '../../scripts/vite/companionPreviewServer';
import { createCompanionPreviewSqliteHost } from '../../scripts/vite/companionPreviewSqliteHost';

let root: string;
let server: Server;
let host: ReturnType<typeof createCompanionPreviewSqliteHost>;
afterEach(async () => {
  vi.unstubAllGlobals();
  await host?.close();
  await new Promise<void>(resolve => server?.close(() => resolve()));
  if (root) rmSync(root, { recursive: true, force: true });
});

async function openTransport() {
  root = mkdtempSync(path.join(os.tmpdir(), 'preview-document-'));
  host = createCompanionPreviewSqliteHost(path.join(root, 'library.db'));
  const calls: string[] = [];
  server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += String(chunk);
    const { method } = JSON.parse(body) as { method: string };
    calls.push(method);
    const result = await handleCompanionPreviewSqlite(host, body);
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(result.payload));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing HTTP address');
  const nativeFetch = globalThis.fetch;
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => nativeFetch(`http://127.0.0.1:${address.port}${url}`, init));
  return calls;
}

it('drains accepted writes, refuses late writes, and opens one replacement against the same SQLite file', async () => {
  const calls = await openTransport();
  const old = createCompanionPreviewDocument();
  const target = { database: 'preview' };
  await old.call('createConnection', target);
  await old.call('open', target);
  await old.call('execute', { ...target, statement: 'CREATE TABLE notes (body TEXT);' });
  const accepted = old.call('run', { ...target, statement: 'INSERT INTO notes VALUES (?)', values: ['saved'] });
  const closed = old.close();
  await expect(old.call('run', { ...target, statement: 'INSERT INTO notes VALUES (?)', values: ['late'] }))
    .rejects.toThrow('closing');
  await accepted;
  await closed;
  expect(calls.slice(-2)).toEqual(['run', 'closeAllConnections']);
  const replacement = createCompanionPreviewDocument();
  expect(replacement.session).not.toBe(old.session);
  await replacement.call('createConnection', target);
  await replacement.call('open', target);
  expect(await replacement.call('query', { ...target, statement: 'SELECT body FROM notes', values: [] }))
    .toMatchObject({ values: [{ body: 'saved' }] });
  await replacement.close();
});

it('reports a pending SQLite write failure instead of silently finishing the update', async () => {
  const calls = await openTransport();
  const document = createCompanionPreviewDocument();
  const target = { database: 'preview' };
  await document.call('createConnection', target);
  await document.call('open', target);
  const writing = document.call('run', { ...target, statement: 'INSERT INTO missing_table VALUES (1)' });
  const closing = document.close();
  await Promise.all([
    expect(writing).rejects.toThrow('no such table'),
    expect(closing).rejects.toThrow('no such table')
  ]);
  expect(calls).not.toContain('closeAllConnections');
  await document.close();
  expect(calls.at(-1)).toBe('closeAllConnections');
});
