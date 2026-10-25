import { AttachmentBatchBudget, assertAttachmentBatchQueries } from './attachmentBatchContract.js';
import { ATTACHMENT_BLOCK_BYTES } from './attachmentBlockReceiver.js';
import type { AttachmentBlockSource } from './attachmentBlockTransfer.js';
import { AttachmentVerificationPending } from './attachmentSourceVerification.js';
import { attachmentWorkBudget } from './attachmentWorkBudget.js';
import { attachmentRequestSchema, type AttachmentRequest } from './requestSyncAttachmentContract.js';
import type { RequestSyncMessage } from './requestSyncObjectMessages.js';

type File = Parameters<Parameters<AttachmentBlockSource['withFile']>[1]>[0];
type Input = { source: AttachmentBlockSource; queries: readonly AttachmentRequest[]; signal?: AbortSignal;
  shouldYield: () => boolean; onProgress?: (() => void) | undefined };

/** One response owns successive verified source leases, including the write of each file's end. */
export async function* attachmentBatchSource(input: Input): AsyncGenerator<RequestSyncMessage> {
  assertAttachmentBatchQueries(input.queries);
  const budget = new AttachmentBatchBudget();
  let stop = false;
  for (const query of input.queries) {
    if (stop || (budget.payloadBytes > 0 && input.shouldYield())) break;
    input.signal?.throwIfAborted();
    let described = false;
    try {
      yield* withSource(input, query, async function* (file) {
        const value = attachmentRequestSchema.parse({ ...query, ...file.resource });
        if (query.byteLength && query.byteLength !== value.byteLength) throw new Error('attachment_batch_source_length_changed');
        if (query.offset > value.byteLength) {
          yield budget.account({ ...value, state: 'restart' });
          return;
        }
        described = true;
        yield budget.account({ ...value, state: 'description' });
        let offset = query.offset;
        while (offset < value.byteLength) {
          const length = Math.min(ATTACHMENT_BLOCK_BYTES, value.byteLength - offset);
          if (!budget.canRead(length) || (budget.payloadBytes > 0 && input.shouldYield())) { stop = true; break; }
          input.signal?.throwIfAborted(); input.onProgress?.();
          const data = await file.read(offset, length);
          if (data.length !== length) throw new Error('attachment_source_truncated');
          input.onProgress?.();
          yield budget.account({ ...value, offset, data, state: 'block' });
          offset += length;
        }
        yield budget.account({ ...value, offset, state: offset === value.byteLength ? 'file_end' : 'range_end' });
      });
    } catch (error) {
      if (described) throw error;
      const pending = error instanceof AttachmentVerificationPending;
      if (!pending && !(error instanceof Error && error.message === 'attachment_source_missing')) throw error;
      yield budget.account({ ...query, state: 'unavailable', pending });
    }
  }
  yield budget.account({ ...input.queries[0]!, storageKey: '', byteLength: 0, offset: budget.payloadBytes, state: 'batch_end' });
}

/** Adapt the existing callback lease without closing a source while its generator is suspended. */
async function* withSource(input: Input, query: AttachmentRequest,
  messages: (file: File) => AsyncGenerator<RequestSyncMessage>) {
  let ready: (file: File) => void = () => {};
  let failed: (error: unknown) => void = () => {};
  const file = new Promise<File>((resolve, reject) => { ready = resolve; failed = reject; });
  let release = () => {};
  const released = new Promise<void>(resolve => { release = resolve; });
  const verificationBudget = attachmentWorkBudget(250);
  const held = input.source.withFile(query.storageKey, async source => { ready(source); await released; }, {
    shouldYield: () => { input.signal?.throwIfAborted(); return verificationBudget() || input.shouldYield(); }
  });
  void held.catch(failed);
  try { yield* messages(await file); }
  finally { release(); await held; }
}
