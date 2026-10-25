import { AttachmentBatchCapacity } from './attachmentBatchCapacity.js';
import { assertAttachmentBatchReceiveInput, type AttachmentBatchDataEntry, AttachmentBatchDataResult, AttachmentBatchReceiveInput,
  AttachmentBatchSealedFile, PreparedAttachmentBatch, ReceiveAttachmentBatch } from './attachmentBatchReceiveContract.js';
import { AttachmentBatchResponse, type AttachmentBatchEvent } from './attachmentBatchResponse.js';
import type { AttachmentBlockFiles } from './attachmentBlockReceiver.js';
import { attachmentMessage, attachmentRequestSchema } from './requestSyncAttachmentContract.js';
import type { PreparedRequestSyncExchange, RequestSyncExchange } from './requestSyncDatabaseExchange.js';
import { prepareRequestSyncWire, readRequestSyncWire } from './requestSyncWire.js';

/** Desktop streams use the same shared completion consumer as native file handoff. */
export function createAttachmentBatchStreamReceiver(exchange: RequestSyncExchange, files: AttachmentBlockFiles) {
  const capacity = new AttachmentBatchCapacity();
  let active = false;
  let preparing = false;
  let prepared = false;
  const prepare = async (input: AttachmentBatchReceiveInput): Promise<PreparedAttachmentBatch> => {
    assertAttachmentBatchReceiveInput(input);
    if (prepared || preparing) throw new Error('attachment_batch_preparation_busy');
    preparing = true;
    try {
      const body = await prepareRequestSyncWire({ ...exchange, messages: async function* () { for (const query of input.queries) yield attachmentMessage(query); } });
      const path = '/companion/framed-sync?request=attachments';
      let request: PreparedRequestSyncExchange;
      try { request = exchange.prepareRequest ? await exchange.prepareRequest(path, body) : {
        send: (consume, options) => exchange.request(path, body, consume, options), dispose: async () => {}
      }; } catch (error) { await body.frames.return(undefined); throw error; }
      prepared = true;
      let state: 'prepared' | 'started' | 'discarded' = 'prepared';
      const discard = async () => {
        if (state === 'started') throw new Error('attachment_batch_data_running');
        if (state === 'prepared') { state = 'discarded'; prepared = false; }
        await request.dispose(); await body.frames.return(undefined);
      };
      return { entries: input.entries, discard, start: async () => {
        if (active || state !== 'prepared') throw new Error('attachment_batch_data_busy');
        active = true; prepared = false; state = 'started';
        const stop = new AbortController();
        const signal = exchange.signal ? AbortSignal.any([exchange.signal, stop.signal]) : stop.signal;
        const sealed = new Set<Promise<void>>();
        const data = receive({ ...exchange, signal }, files, input, capacity, sealed, request).finally(async () => {
          active = false; await request.dispose(); await body.frames.return(undefined);
        });
        void data.catch(() => undefined);
        return { data, stop: async () => { stop.abort(new Error('attachment_batch_stopped')); await data.catch(() => undefined); },
          exit: async () => { await data.catch(() => undefined); await Promise.all(sealed); } };
      } };
    } finally { preparing = false; }
  };
  const start: ReceiveAttachmentBatch = async input => (await prepare(input)).start();
  return Object.assign(start, { prepare });
}

async function receive(exchange: RequestSyncExchange & { signal: AbortSignal }, files: AttachmentBlockFiles,
  input: AttachmentBatchReceiveInput, capacity: AttachmentBatchCapacity, sealed: Set<Promise<void>>,
  request: PreparedRequestSyncExchange): Promise<AttachmentBatchDataResult> {
  const permission = new AttachmentBatchResponse(input.queries);
  const candidates = new Map(input.entries.map(entry => [entry.storageKey, entry]));
  const result: AttachmentBatchDataResult = { entries: [], bytes: 0, blocks: 0 };
  let release: (() => void) | undefined;
  let blocks = 0;
  try {
    return await request.send(async response => {
      for await (const decoded of readRequestSyncWire({ ...exchange, ...response })) {
        if (decoded.message.payloadCase !== 'request_attachment') throw new Error('attachment_batch_response_invalid');
        const value = attachmentRequestSchema.parse(decoded.message.payload);
        const event = permission.accept(value, decoded.encoded.length);
        if (event.kind === 'description') {
          release = await capacity.reserve(exchange.signal);
          const candidate = candidates.get(event.resource.storageKey)!;
          const hash = event.resource.storageKey.slice(0, 64);
          if (await files.partialLength(hash) !== candidate.partialLength) throw new Error('attachment_partial_length_changed');
          await files.truncate(hash, event.offset); blocks = 0;
        } else if (event.kind === 'block') {
          await files.append(event.resource.storageKey.slice(0, 64), event.offset, event.data);
          blocks++; result.blocks++; result.bytes += event.data.length;
        } else if (event.kind === 'file_end') {
          const file = completion(files, event, release!, sealed); release = undefined;
          try { input.sealed(file); } catch (error) { await file.settle('failed'); throw error; }
          result.entries.push(entry(event, blocks));
        } else if (event.kind === 'range_end') {
          release?.(); release = undefined; result.entries.push(entry(event, blocks));
        } else if (event.kind === 'restart') result.entries.push({ ...event, state: 'restart', blocks: 0, pending: false });
        else if (event.kind === 'unavailable') {
          const candidate = candidates.get(event.storageKey)!;
          result.entries.push({ storageKey: event.storageKey, byteLength: candidate.byteLength, offset: candidate.offset,
            state: 'unavailable', blocks: 0, pending: event.pending });
        }
      }
      permission.finish(); return result;
    }, { signal: exchange.signal });
  } finally { release?.(); }
}

function entry(event: Extract<AttachmentBatchEvent, { kind: 'file_end' | 'range_end' }>, blocks: number): AttachmentBatchDataEntry {
  return { ...event.resource, state: event.kind, offset: event.offset, blocks, pending: false };
}

function completion(files: AttachmentBlockFiles, event: Extract<AttachmentBatchEvent, { kind: 'file_end' | 'range_end' }>,
  release: () => void, pending: Set<Promise<void>>): AttachmentBatchSealedFile {
  const { resource } = event;
  const hash = resource.storageKey.slice(0, 64);
  let phase: 'sealed' | 'verified' | 'published' | 'settled-published' | 'settled-failed' = 'sealed';
  let settled = () => {};
  const done = new Promise<void>(resolve => { settled = resolve; });
  pending.add(done);
  return { resource, ready: Promise.resolve(), exit: async () => {},
    verify: async () => {
      if (phase === 'published' || phase === 'settled-published') return files.complete(resource);
      if (phase === 'settled-failed') return false;
      const verified = await files.partialLength(hash) === resource.byteLength && await files.verifyPartial(hash);
      phase = verified ? 'verified' : 'sealed'; return verified;
    },
    publish: async () => {
      if (phase === 'published' || phase === 'settled-published') return;
      if (phase !== 'verified') throw new Error('attachment_verification_required');
      await files.publish(resource); phase = 'published';
    },
    discard: async () => { if (phase === 'sealed' || phase === 'verified') await files.discardPartial(hash); },
    settle: async next => {
      if (phase === 'settled-published' || phase === 'settled-failed') {
        if (phase !== `settled-${next}`) throw new Error('attachment_settlement_changed'); return;
      }
      if (next === 'published' && phase !== 'published') throw new Error('attachment_settlement_invalid');
      phase = `settled-${next}`; release(); pending.delete(done); settled();
    } };
}
