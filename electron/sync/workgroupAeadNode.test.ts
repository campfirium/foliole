import { expect, it } from 'vitest';

import { decryptWorkgroupPayloadNode, encryptWorkgroupPayloadNode } from './workgroupAeadNode.js';

it('matches the shared Workgroup AEAD v1 vector', () => {
  const context = {
    contentType: 'application/json', direction: 'request' as const,
    groupTag: '630dcd2966c4336691125448bbb25b4f', method: 'POST', pathWithQuery: '/companion/sync-push'
  };
  const envelope = encryptWorkgroupPayloadNode({
    context, groupKey: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8',
    nonce: Buffer.from('0102030405060708090a0b0c', 'hex'), plaintext: Buffer.from('{"value":1}'),
    timestampMs: 1_786_781_200_000
  });
  expect(envelope.ciphertext).toBe('X6wLBwtVPIRfflAcV4td2Jm0DTCJJkYMYJMy');
  expect(decryptWorkgroupPayloadNode({ context, envelope,
    groupKey: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8', nowMs: 1_786_781_200_000 }).toString())
    .toBe('{"value":1}');
});

it('rejects non-standard nonce and authentication tag lengths', () => {
  const context = {
    contentType: 'application/json', direction: 'request' as const,
    groupTag: '630dcd2966c4336691125448bbb25b4f', method: 'POST', pathWithQuery: '/companion/sync-push'
  };
  const groupKey = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
  expect(() => encryptWorkgroupPayloadNode({
    context, groupKey, nonce: Buffer.alloc(8), plaintext: Buffer.from('{}')
  })).toThrow('workgroup_aead_nonce_invalid');
  expect(() => decryptWorkgroupPayloadNode({ context, groupKey, nowMs: 1,
    envelope: { ciphertext: Buffer.alloc(15).toString('base64url'), content_type: 'application/json',
      nonce: Buffer.alloc(12).toString('base64url'), timestamp_ms: 1, version: 'foliole-workgroup-aead-v1' }
  })).toThrow('workgroup_aead_authentication_failed');
});
