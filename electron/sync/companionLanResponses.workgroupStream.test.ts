import { promises as fs } from 'node:fs';
import type http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';

import { afterEach, expect, it, vi } from 'vitest';

const GROUP_KEY = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
const GROUP_TAG = '630dcd2966c4336691125448bbb25b4f';
const keyStore = vi.hoisted(() => ({
  loadDesktopWorkgroupKey: vi.fn(() => ({
    group_key: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8',
    group_tag: '630dcd2966c4336691125448bbb25b4f'
  }))
}));

vi.mock('./workgroupKeyStore.js', () => keyStore);

import { writeWorkgroupFileStream } from './companionLanResponses.js';
import { decryptWorkgroupPayloadNode } from './workgroupAeadNode.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true }))));

it('streams a large attachment into one authenticated workgroup envelope', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-workgroup-stream-'));
  roots.push(root);
  const filePath = path.join(root, 'attachment.bin');
  const plaintext = Buffer.alloc(256 * 1024 + 7, 0x5a);
  await fs.writeFile(filePath, plaintext);
  const chunks: Buffer[] = [];
  const writable = new Writable({ write(chunk, _encoding, done) { chunks.push(Buffer.from(chunk)); done(); } });
  const response = writable as unknown as http.ServerResponse;
  response.writeHead = vi.fn() as unknown as http.ServerResponse['writeHead'];
  const request = {
    headers: { 'x-sync-group-id': 'group-1' }, method: 'GET', url: '/companion/attachment-resource?id=1'
  } as unknown as http.IncomingMessage;

  await writeWorkgroupFileStream(request, response, 200, { filePath, mimeType: 'application/octet-stream' });

  const envelope = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const decrypted = decryptWorkgroupPayloadNode({
    context: {
      contentType: 'application/octet-stream', direction: 'response', groupTag: GROUP_TAG,
      method: 'GET', pathWithQuery: '/companion/attachment-resource?id=1'
    }, envelope, groupKey: GROUP_KEY
  });
  expect(decrypted).toEqual(plaintext);
  expect(response.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
    'Content-Type': 'application/vnd.foliole.workgroup-aead+json'
  }));
});

it('authenticates only the requested attachment range and binds its offset', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-workgroup-range-'));
  roots.push(root);
  const filePath = path.join(root, 'attachment.bin');
  await fs.writeFile(filePath, Buffer.from('abcdefghijklmnop'));
  const chunks: Buffer[] = [];
  const writable = new Writable({ write(chunk, _encoding, done) { chunks.push(Buffer.from(chunk)); done(); } });
  const response = writable as unknown as http.ServerResponse;
  response.writeHead = vi.fn() as unknown as http.ServerResponse['writeHead'];
  const route = '/companion/attachment-resource?attachment_id=att&content_hash=hash&offset=4&length=6';
  const request = { headers: { 'x-sync-group-id': 'group-1' }, method: 'GET', url: route } as unknown as http.IncomingMessage;

  await writeWorkgroupFileStream(request, response, 200, {
    byteOffset: 4, contentLength: 6, totalBytes: 16, filePath, mimeType: 'application/octet-stream'
  });
  const envelope = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const context = { contentType: 'application/octet-stream', direction: 'response' as const,
    groupTag: GROUP_TAG, method: 'GET', pathWithQuery: route };
  expect(decryptWorkgroupPayloadNode({ context, envelope, groupKey: GROUP_KEY }).toString())
    .toBe('efghij');
  expect(() => decryptWorkgroupPayloadNode({ context: { ...context,
    pathWithQuery: route.replace('offset=4', 'offset=0') }, envelope, groupKey: GROUP_KEY })).toThrow();
  expect(response.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
    'X-Foliole-Resource-Total-Bytes': 16
  }));
});

it('authenticates an empty attachment range without opening an invalid file interval', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-workgroup-empty-'));
  roots.push(root);
  const filePath = path.join(root, 'empty.bin');
  await fs.writeFile(filePath, '');
  const chunks: Buffer[] = [];
  const writable = new Writable({ write(chunk, _encoding, done) { chunks.push(Buffer.from(chunk)); done(); } });
  const response = writable as unknown as http.ServerResponse;
  response.writeHead = vi.fn() as unknown as http.ServerResponse['writeHead'];
  const route = '/companion/attachment-resource?attachment_id=att&content_hash=empty&offset=0&length=1048576';
  const request = { headers: { 'x-sync-group-id': 'group-1' }, method: 'GET', url: route } as unknown as http.IncomingMessage;

  await writeWorkgroupFileStream(request, response, 200, {
    byteOffset: 0, contentLength: 0, totalBytes: 0, filePath, mimeType: 'application/octet-stream'
  });
  expect(decryptWorkgroupPayloadNode({ context: { contentType: 'application/octet-stream',
    direction: 'response', groupTag: GROUP_TAG, method: 'GET', pathWithQuery: route },
  envelope: JSON.parse(Buffer.concat(chunks).toString('utf8')), groupKey: GROUP_KEY })).toHaveLength(0);
});
