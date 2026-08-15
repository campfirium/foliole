import { describe, expect, it } from 'vitest';

import {
  decryptWorkgroupPayload,
  deriveWorkgroupTag,
  encryptWorkgroupPayload,
  workgroupAeadNonceIdentity
} from './workgroupAead.js';

const GROUP_KEY = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
const NONCE = Uint8Array.from({ length: 12 }, (_, index) => index + 1);
const CONTEXT = {
  contentType: 'application/json', direction: 'request' as const,
  groupTag: '630dcd2966c4336691125448bbb25b4f', method: 'POST', pathWithQuery: '/companion/sync-push'
};

describe('workgroup AEAD v1', () => {
  it('derives a public tag and round-trips a deterministic authenticated envelope', async () => {
    expect(await deriveWorkgroupTag(GROUP_KEY)).toBe(CONTEXT.groupTag);
    const envelope = await encryptWorkgroupPayload({
      context: CONTEXT, groupKey: GROUP_KEY, nonce: NONCE,
      plaintext: new TextEncoder().encode('{"value":1}'), timestampMs: 1_786_781_200_000
    });
    expect(envelope).toEqual({
      ciphertext: 'X6wLBwtVPIRfflAcV4td2Jm0DTCJJkYMYJMy', content_type: 'application/json',
      nonce: 'AQIDBAUGBwgJCgsM', timestamp_ms: 1_786_781_200_000, version: 'foliole-workgroup-aead-v1'
    });
    const plaintext = await decryptWorkgroupPayload({
      context: CONTEXT, envelope, groupKey: GROUP_KEY, nowMs: 1_786_781_200_000
    });
    expect(new TextDecoder().decode(plaintext)).toBe('{"value":1}');
    expect(workgroupAeadNonceIdentity(envelope)).toBe('1786781200000:AQIDBAUGBwgJCgsM');
  });

  it('rejects changed AAD, ciphertext, keys, and stale messages', async () => {
    const envelope = await encryptWorkgroupPayload({
      context: CONTEXT, groupKey: GROUP_KEY, nonce: NONCE, plaintext: new Uint8Array([1, 2, 3]), timestampMs: 100_000
    });
    await expect(decryptWorkgroupPayload({ context: { ...CONTEXT, pathWithQuery: '/other' }, envelope,
      groupKey: GROUP_KEY, nowMs: 100_000 })).rejects.toThrow('workgroup_aead_authentication_failed');
    await expect(decryptWorkgroupPayload({ context: CONTEXT, envelope: { ...envelope, ciphertext: `${envelope.ciphertext}A` },
      groupKey: GROUP_KEY, nowMs: 100_000 })).rejects.toThrow('workgroup_aead_authentication_failed');
    await expect(decryptWorkgroupPayload({ context: CONTEXT, envelope, groupKey: 'Hx4dHBsaGRgXFhUUExIREA8ODQwLCgkIBwYFBAMCAQA',
      nowMs: 100_000 })).rejects.toThrow('workgroup_aead_authentication_failed');
    await expect(decryptWorkgroupPayload({ context: CONTEXT, envelope, groupKey: GROUP_KEY,
      nowMs: 160_001 })).rejects.toThrow('workgroup_aead_expired');
  });
});
