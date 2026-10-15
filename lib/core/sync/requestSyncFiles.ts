import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import { TEXT_BODY_MAX_BYTES } from '../nodes/textBodyBudget.js';

import type { CanonicalBlob, CanonicalFact } from './framedSyncCanonicalManifest.js';
import { FRAMED_SYNC_FRAME_TYPES, FRAMED_SYNC_LIMITS } from './framedSyncContract.js';
import { FramedSyncFactFragmentDecoder } from './framedSyncFactFrameReader.js';
import { iterateFramedSyncFactPayloads } from './framedSyncFactPayloads.js';
import { framedSyncFileKey, type FramedSyncFilePort } from './framedSyncFilePort.js';
import { decodeAndValidateProtocolMessage, encodeValidatedProtocolMessage, type ValidatedProtocolMessage } from './framedSyncProtocolCodec.js';
import { canonicalFactFromValidatedMessage } from './framedSyncWireFact.js';

export type RequestSyncFilePort = Pick<FramedSyncFilePort, 'read' | 'write' | 'remove'>;
export const REQUEST_SYNC_MEMORY_BYTES = 4 * 1024 * 1024;

/** Request-local plaintext facts and bodies. No publication, attempt, receipt or encrypted frame is stored. */
export class RequestSyncFiles {
  private readonly facts: Array<{ first: number; end: number; kind: number }> = [];
  private readonly memory = new Map<string, Uint8Array>();
  private memoryBytes = 0;
  private writtenBytes = 0;
  private usesScratchStorage = false;

  get byteLength() { return this.writtenBytes; }
  private nextFrame = 0;
  private closed = false;

  constructor(private readonly files: RequestSyncFilePort, readonly directory: string,
    private readonly signal?: AbortSignal) {}

  private check() {
    this.signal?.throwIfAborted();
    if (this.closed) throw new Error('request_sync_files_closed');
  }

  private async write(key: string, bytes: Uint8Array) {
    this.writtenBytes += bytes.byteLength;
    const previous = this.memory.get(key);
    if (previous) { this.memoryBytes -= previous.byteLength; this.memory.delete(key); }
    if (this.memoryBytes + bytes.byteLength <= REQUEST_SYNC_MEMORY_BYTES) {
      this.memory.set(key, Uint8Array.from(bytes));
      this.memoryBytes += bytes.byteLength;
    } else {
      await this.writeScratchFile(key, bytes);
    }
  }

  async writeScratchFile(key: string, bytes: Uint8Array) {
    this.check();
    this.usesScratchStorage = true;
    await this.files.write(key, bytes);
  }

  private read(key: string) {
    return this.memory.get(key) ?? this.files.read(key);
  }

  async writeFact(fact: CanonicalFact) {
    this.check();
    const first = this.nextFrame;
    for (const payload of iterateFramedSyncFactPayloads(fact)) {
      this.check();
      await this.write(`${this.directory}/fact-${this.nextFrame++}`, encodeValidatedProtocolMessage(payload.payloadCase, payload.payload));
    }
    this.facts.push({ first, end: this.nextFrame, kind: fact.kind });
  }

  async *readFacts(kinds?: readonly number[]): AsyncIterable<CanonicalFact> {
    for await (const record of this.readFactRecords(kinds)) yield record.fact;
  }

  async *readFactRecords(kinds?: readonly number[]): AsyncIterable<{
    fact: CanonicalFact; wire: { message: ValidatedProtocolMessage; encoded: Uint8Array } | null;
  }> {
    this.check();
    for (const range of this.facts) {
      if (kinds && !kinds.includes(range.kind)) continue;
      const decoder = new FramedSyncFactFragmentDecoder();
      let complete = false;
      for (let index = range.first; index < range.end; index++) {
        this.check();
        const bytes = await this.read(`${this.directory}/fact-${index}`);
        if (!bytes) throw new Error('request_sync_fact_missing');
        const message = decodeAndValidateProtocolMessage(bytes, FRAMED_SYNC_FRAME_TYPES.fact);
        if (complete) throw new Error('request_sync_fact_trailing_frame');
        if (message.payloadCase === 'fact' && index !== range.first) throw new Error('request_sync_fact_incomplete');
        const fact = message.payloadCase === 'fact' ? message : decoder.accept(message, BigInt(index))?.message;
        if (!fact) continue;
        if (index !== range.end - 1) throw new Error('request_sync_fact_trailing_frame');
        complete = true;
        const canonical = canonicalFactFromValidatedMessage(fact);
        if (canonical.kind !== range.kind) throw new Error('request_sync_fact_kind_mismatch');
        yield { fact: canonical,
          wire: range.end === range.first + 1 && message.payloadCase === 'fact'
            ? { message, encoded: bytes.slice() } : null };
      }
      if (!complete) throw new Error('request_sync_fact_incomplete');
    }
  }

  async writeBody(blob: CanonicalBlob, bytes: Uint8Array) {
    this.check();
    if (bytes.byteLength > TEXT_BODY_MAX_BYTES || BigInt(bytes.byteLength) !== blob.byteLength ||
        bytesToHex(sha256(bytes)) !== bytesToHex(blob.sha256)) {
      throw new Error('request_sync_body_identity_mismatch');
    }
    for (let offset = 0; offset < bytes.length; offset += FRAMED_SYNC_LIMITS.blobChunkBytes) {
      this.check();
      await this.write(this.bodyKey(blob, offset), bytes.subarray(offset, offset + FRAMED_SYNC_LIMITS.blobChunkBytes));
    }
  }

  async loadBody(blob: CanonicalBlob) {
    this.check();
    const length = Number(blob.byteLength);
    if (!Number.isSafeInteger(length) || length < 0 || length > TEXT_BODY_MAX_BYTES) {
      throw new Error('request_sync_body_length_invalid');
    }
    const result = new Uint8Array(length);
    for (let offset = 0; offset < length; offset += FRAMED_SYNC_LIMITS.blobChunkBytes) {
      this.check();
      const bytes = await this.read(this.bodyKey(blob, offset));
      if (!bytes || bytes.length !== Math.min(FRAMED_SYNC_LIMITS.blobChunkBytes, length - offset)) {
        throw new Error('request_sync_body_chunk_missing');
      }
      result.set(bytes, offset);
    }
    if (bytesToHex(sha256(result)) !== bytesToHex(blob.sha256)) throw new Error('request_sync_body_digest_mismatch');
    return result;
  }

  private bodyKey(blob: CanonicalBlob, offset: number) {
    return `${this.directory}/body-${bytesToHex(blob.sha256)}-${offset}`;
  }

  async close() {
    this.closed = true;
    this.facts.length = 0;
    this.memory.clear();
    this.memoryBytes = 0;
    if (this.usesScratchStorage) await this.files.remove(this.directory);
  }
}

export async function withRequestSyncFiles<T>(files: RequestSyncFilePort,
  execute: (request: RequestSyncFiles) => Promise<T>, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const request = new RequestSyncFiles(files, framedSyncFileKey('requests', crypto.randomUUID()), signal);
  try {
    const result = await execute(request);
    signal?.throwIfAborted();
    return result;
  }
  finally { await request.close(); }
}
