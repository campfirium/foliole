import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import { TEXT_BODY_MAX_BYTES } from '../nodes/textBodyBudget.js';

import type { CanonicalBlob } from './framedSyncCanonicalManifest.js';
import { FRAMED_SYNC_LIMITS } from './framedSyncContract.js';
import { bytes, text, unsigned } from './framedSyncDecodedValues.js';
import { FramedSyncFactFragmentDecoder } from './framedSyncFactFrameReader.js';
import type { ValidatedProtocolMessage } from './framedSyncProtocolCodec.js';
import { canonicalFactFromValidatedMessage } from './framedSyncWireFact.js';
import type { RequestSyncFiles } from './requestSyncFiles.js';
import type { RequestSyncObjectHeader } from './requestSyncObjectMessages.js';

class RequestBodies {
  readonly known = new Map<string, CanonicalBlob>();
  private readonly pending: CanonicalBlob[] = [];
  private data: Uint8Array | undefined;
  private offset = 0;

  constructor(private readonly files: RequestSyncFiles, private readonly contextId: Uint8Array) {}

  async declare(blobs: readonly CanonicalBlob[]) {
    for (const blob of blobs) {
      if (![1, 5].includes(blob.role) || blob.byteLength > BigInt(TEXT_BODY_MAX_BYTES)) {
        throw new Error('request_sync_body_descriptor_invalid');
      }
      const key = bytesToHex(blob.sha256);
      const previous = this.known.get(key);
      if (previous && previous.byteLength !== blob.byteLength) throw new Error('request_sync_body_identity_mismatch');
      if (previous) continue;
      this.known.set(key, blob);
      if (blob.byteLength === 0n) await this.files.writeBody(blob, new Uint8Array());
      else this.pending.push(blob);
    }
  }

  get complete() { return this.pending.length === 0; }

  async accept(message: ValidatedProtocolMessage) {
    const blob = this.pending[0];
    const payload = message.payload;
    const chunk = bytes(payload.data, 'data');
    if (!blob || !same(bytes(payload.transferId, 'context_id'), this.contextId) ||
        !same(bytes(payload.blobHash, 'blob_hash'), blob.sha256) ||
        unsigned(payload.offset, 'offset') !== BigInt(this.offset) ||
        chunk.length !== Math.min(FRAMED_SYNC_LIMITS.blobChunkBytes, Number(blob.byteLength) - this.offset)) {
      throw new Error('request_sync_body_chunk_invalid');
    }
    this.data ??= new Uint8Array(Number(blob.byteLength));
    this.data.set(chunk, this.offset); this.offset += chunk.length;
    if (this.offset !== this.data.length) return;
    await this.files.writeBody(blob, this.data);
    this.pending.shift(); this.data = undefined; this.offset = 0;
  }
}

function same(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export type RequestSyncDecodedMessage = Readonly<{ message: ValidatedProtocolMessage; encoded: Uint8Array }>;

export async function receiveRequestSyncObjectMessages(messages: AsyncIterable<RequestSyncDecodedMessage>,
  contextId: Uint8Array, files: RequestSyncFiles) {
  const digest = sha256.create();
  const bodies = new RequestBodies(files, contextId);
  const facts = new Set<string>();
  let header: RequestSyncObjectHeader | undefined;
  let fragment: FramedSyncFactFragmentDecoder | undefined;
  let sequence = 0n;
  let ended = false;
  for await (const { message, encoded } of messages) {
    if (ended) throw new Error('request_sync_object_trailing_data');
    if (!header) {
      header = readHeader(message);
    } else if (message.payloadCase === 'request_object_end') {
      if (fragment || !bodies.complete || (files.dailyFlow.begin && !files.dailyFlow.complete) ||
          !same(bytes(message.payload.requestId, 'request_id'), header.requestId) ||
          !same(bytes(message.payload.streamHash, 'stream_hash'), digest.digest()) ||
          unsigned(message.payload.factCount, 'fact_count') !== BigInt(facts.size) ||
          unsigned(message.payload.bodyCount, 'body_count') !== BigInt(bodies.known.size)) {
        throw new Error('request_sync_object_incomplete');
      }
      ended = true;
      continue;
    } else if (message.payloadCase.startsWith('daily_flow_table_')) {
      if (header.objectType !== 'daily_flow' || fragment || facts.size || bodies.known.size) {
        throw new Error('daily_flow_table_object_invalid');
      }
      await files.dailyFlow.accept(message);
    } else if (files.dailyFlow.begin) throw new Error('daily_flow_table_object_invalid');
    else if (message.payloadCase === 'blob_chunk' && !fragment) await bodies.accept(message);
    else {
      if (!bodies.complete) throw new Error('request_sync_body_incomplete');
      if (message.payloadCase === 'fact_fragment') fragment ??= new FramedSyncFactFragmentDecoder();
      else if (fragment || message.payloadCase !== 'fact') throw new Error('request_sync_fact_invalid');
      const complete = fragment ? fragment.accept(message, sequence)?.message : message;
      if (complete) {
        const fact = canonicalFactFromValidatedMessage(complete);
        if (fact.objectType !== header.objectType || fact.globalId !== header.globalId) {
          throw new Error('request_sync_object_identity_mismatch');
        }
        const identity = `${fact.kind}:${fact.factId}`;
        if (facts.has(identity)) throw new Error('request_sync_fact_duplicate');
        facts.add(identity);
        if (message.payloadCase === 'fact') await files.writeDecodedFact(message);
        else await files.writeFact(fact);
        await bodies.declare(fact.blobs);
        fragment = undefined;
      }
    }
    digest.update(encoded);
    sequence++;
  }
  if (!header || !ended || (header.objectType === 'daily_flow' && !files.dailyFlow.complete)) throw new Error('request_sync_object_incomplete');
  return header;
}

function readHeader(message: ValidatedProtocolMessage): RequestSyncObjectHeader {
  if (message.payloadCase !== 'request_object_header') throw new Error('request_sync_object_header_required');
  if (message.payload.objectType === 'node' && !message.payload.currentVersionId) {
    throw new Error('request_sync_current_version_unavailable');
  }
  return { requestId: bytes(message.payload.requestId, 'request_id').slice(),
    objectType: text(message.payload.objectType, 'object_type'), globalId: text(message.payload.globalId, 'global_id'),
    currentVersionId: typeof message.payload.currentVersionId === 'string' ? message.payload.currentVersionId : '',
    sourceStateHash: bytes(message.payload.sourceStateHash, 'source_state_hash').slice() };
}
