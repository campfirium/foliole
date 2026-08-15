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
