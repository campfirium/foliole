import { createDecipheriv, type DecipherGCM } from 'node:crypto';
import { once } from 'node:events';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';

import { runWithDatabaseConnectionOwner } from '../database/connection.js';

import { deriveWorkgroupKeyNode, encodeWorkgroupAadNode } from './workgroupAeadNode.js';
import { consumeDesktopWorkgroupNonce, loadDesktopWorkgroupKey } from './workgroupKeyStore.js';

interface EnvelopeHeader {
  content_type: unknown;
  nonce: unknown;
  timestamp_ms: unknown;
  version: unknown;
}

async function readEnvelopeHeader(encryptedPath: string) {
  const file = await fs.open(encryptedPath, 'r');
  let header: EnvelopeHeader;
  let payloadStart: number;
  let payloadEnd: number;
  try {
    const size = (await file.stat()).size;
    if (size < 32) throw new Error('workgroup_aead_envelope_invalid');
    const prefix = Buffer.alloc(Math.min(size, 512));
    await file.read(prefix, 0, prefix.length, 0);
    const prefixDelimiter = Buffer.from(',"ciphertext":"');
    const prefixEnd = prefix.indexOf(prefixDelimiter);
    if (prefixEnd >= 0) {
      header = JSON.parse(`${prefix.subarray(0, prefixEnd).toString('utf8')}}`) as EnvelopeHeader;
      payloadStart = prefixEnd + prefixDelimiter.length;
      const suffix = Buffer.alloc(2);
      await file.read(suffix, 0, 2, size - 2);
      if (suffix.toString('ascii') !== '"}') throw new Error('workgroup_aead_envelope_invalid');
      payloadEnd = size - 3;
    } else {
      const ciphertextPrefix = Buffer.from('{"ciphertext":"');
      if (!prefix.subarray(0, ciphertextPrefix.length).equals(ciphertextPrefix)) {
        throw new Error('workgroup_aead_envelope_invalid');
      }
      const suffix = Buffer.alloc(Math.min(size - ciphertextPrefix.length, 512));
      const suffixStart = size - suffix.length;
      await file.read(suffix, 0, suffix.length, suffixStart);
      const delimiter = Buffer.from('","content_type":');
      const delimiterStart = suffix.indexOf(delimiter);
      if (delimiterStart < 0) throw new Error('workgroup_aead_envelope_invalid');
      header = JSON.parse(`{${suffix.subarray(delimiterStart + 2).toString('utf8')}`) as EnvelopeHeader;
      payloadStart = ciphertextPrefix.length;
    payloadEnd = suffixStart + delimiterStart - 1;
    }
  } finally {
    await file.close();
  }
  return { header, payloadEnd, payloadStart };
}

interface FileResponseArgs {
  contentType: string;
  encryptedPath: string;
  groupId: string;
  maxPlaintextBytes?: number;
  method: string;
  outputPath: string;
  pathWithQuery: string;
}

export async function decryptDesktopWorkgroupResponseFile(args: FileResponseArgs) {
  const { header, payloadEnd, payloadStart } = await readEnvelopeHeader(args.encryptedPath);
  if (header.version !== 'foliole-workgroup-aead-v1' ||
      header.content_type !== args.contentType ||
      typeof header.nonce !== 'string' ||
      typeof header.timestamp_ms !== 'number' ||
      !Number.isSafeInteger(header.timestamp_ms) ||
      Math.abs(Date.now() - header.timestamp_ms) > 60_000) {
    throw new Error('workgroup_aead_envelope_invalid');
  }
  const nonce = Buffer.from(header.nonce, 'base64url');
  if (nonce.length !== 12 || nonce.toString('base64url') !== header.nonce) {
    throw new Error('workgroup_aead_envelope_invalid');
  }
  const stored = await runWithDatabaseConnectionOwner(() => loadDesktopWorkgroupKey(args.groupId));
  if (!stored) throw new Error('sync_group_workgroup_key_missing');
  const context = { contentType: args.contentType, direction: 'response' as const,
    groupTag: stored.group_tag, method: args.method, pathWithQuery: args.pathWithQuery };
  const decipher = createDecipheriv('aes-256-gcm', deriveWorkgroupKeyNode(stored.group_key, context), nonce,
    { authTagLength: 16 });
  decipher.setAAD(encodeWorkgroupAadNode(context, header.timestamp_ms));
  const temporaryPath = `${args.outputPath}.unverified`;
  try {
    await decryptPayloadToFile(args, decipher, payloadStart, payloadEnd, temporaryPath);
    const nonceId = `${header.timestamp_ms}:${header.nonce}`;
    const accepted = await runWithDatabaseConnectionOwner(() =>
      consumeDesktopWorkgroupNonce(args.groupId, `response:${nonceId}`));
    if (!accepted) throw new Error('workgroup_aead_replayed');
    await fs.rename(temporaryPath, args.outputPath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    if (error instanceof Error &&
        (error.message.startsWith('workgroup_aead_') ||
          error.message === 'sync_pack_encrypted_payload_limit_exceeded')) throw error;
    throw new Error('workgroup_aead_authentication_failed', { cause: error });
  }
}

async function decryptPayloadToFile(
  args: FileResponseArgs,
  decipher: DecipherGCM,
  payloadStart: number,
  payloadEnd: number,
  temporaryPath: string
) {
  const output = createWriteStream(temporaryPath);
  output.on('error', () => {});
  let encoded = '';
  let held = Buffer.alloc(0);
  let plaintextBytes = 0;
  const writePlaintext = async (bytes: Buffer) => {
    plaintextBytes += bytes.length;
    if (plaintextBytes > (args.maxPlaintextBytes ?? Number.MAX_SAFE_INTEGER)) {
      throw new Error('sync_pack_encrypted_payload_limit_exceeded');
    }
    if (bytes.length && !output.write(bytes)) await once(output, 'drain');
  };
  try {
    for await (const chunk of createReadStream(args.encryptedPath, {
      start: payloadStart, end: payloadEnd, highWaterMark: 8 * 1024
    })) {
      const text = (chunk as Buffer).toString('ascii');
      if (/[^A-Za-z0-9_-]/u.test(text)) throw new Error('workgroup_aead_envelope_invalid');
      encoded += text;
      const complete = encoded.length - encoded.length % 4;
      const bytes = Buffer.concat([held, Buffer.from(encoded.slice(0, complete), 'base64url')]);
      encoded = encoded.slice(complete);
      const usable = Math.max(0, bytes.length - 16);
      if (usable) await writePlaintext(decipher.update(bytes.subarray(0, usable)));
      held = bytes.subarray(usable);
    }
    if (encoded.length % 4 === 1) throw new Error('workgroup_aead_envelope_invalid');
    held = Buffer.concat([held, Buffer.from(encoded, 'base64url')]);
    if (held.length < 16) throw new Error('workgroup_aead_envelope_invalid');
    const last = held.subarray(0, held.length - 16);
    if (last.length) await writePlaintext(decipher.update(last));
    decipher.setAuthTag(held.subarray(held.length - 16));
    await writePlaintext(decipher.final());
    output.end();
    await once(output, 'finish');
  } catch (error) {
    if (!output.closed) await new Promise<void>((resolve) => {
      output.once('close', resolve);
      output.destroy();
    });
    throw error;
  }
}
