// @vitest-environment node

import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

const groupKey = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
const groupTag = '630dcd2966c4336691125448bbb25b4f';
const nonces = vi.hoisted(() => new Set<string>());
vi.mock('../database/connection.js', () => ({
  runWithDatabaseConnectionOwner: async (action: () => unknown) => action()
}));
vi.mock('./workgroupKeyStore.js', () => ({
  loadDesktopWorkgroupKey: () => ({ group_key: groupKey, group_tag: groupTag }),
  consumeDesktopWorkgroupNonce: (_groupId: string, nonce: string) => {
    if (nonces.has(nonce)) return false;
    nonces.add(nonce);
    return true;
  }
}));

import { decryptDesktopWorkgroupResponseFile } from './workgroupAeadFileNode.js';
import { encryptWorkgroupPayloadNode } from './workgroupAeadNode.js';

it('publishes a file only after group authentication and rejects tampering and replay', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-aead-file-'));
  nonces.clear();
  try {
    const encryptedPath = path.join(root, 'response.json');
    const outputPath = path.join(root, 'authenticated.syncpack');
    const plaintext = randomBytes(1024 * 1024 + 11);
    const pathWithQuery = '/companion/sync-pack?after_state_seq=0';
    const context = { contentType: 'application/zip', direction: 'response' as const,
      groupTag, method: 'GET', pathWithQuery };
    const envelope = encryptWorkgroupPayloadNode({ context, groupKey, plaintext });
    await fs.writeFile(encryptedPath, JSON.stringify({ version: envelope.version,
      timestamp_ms: envelope.timestamp_ms, nonce: envelope.nonce,
      content_type: envelope.content_type, ciphertext: envelope.ciphertext }));
    const args = { contentType: 'application/zip', encryptedPath, groupId: 'group',
      method: 'GET', outputPath, pathWithQuery };
    await expect(decryptDesktopWorkgroupResponseFile({ ...args, maxPlaintextBytes: 1024 }))
      .rejects.toThrow('sync_pack_encrypted_payload_limit_exceeded');
    await expect(fs.stat(outputPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await decryptDesktopWorkgroupResponseFile(args);
    expect(await fs.readFile(outputPath)).toEqual(plaintext);
    await fs.rm(outputPath);
    await expect(decryptDesktopWorkgroupResponseFile(args)).rejects.toThrow('workgroup_aead_replayed');
    await expect(fs.stat(outputPath)).rejects.toMatchObject({ code: 'ENOENT' });
    const replacement = envelope.ciphertext[100] === 'A' ? 'B' : 'A';
    const damaged = { ...envelope,
      ciphertext: `${envelope.ciphertext.slice(0, 100)}${replacement}${envelope.ciphertext.slice(101)}` };
    await fs.writeFile(encryptedPath, JSON.stringify(damaged));
    await expect(decryptDesktopWorkgroupResponseFile(args)).rejects.toThrow('workgroup_aead_authentication_failed');
    await expect(fs.stat(outputPath)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    await fs.rm(root, { force: true, recursive: true });
  }
});
