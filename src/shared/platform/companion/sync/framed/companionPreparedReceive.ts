import type { AttachmentRequest } from '../../../../../../lib/core/sync/requestSyncAttachmentContract.js';
import type { PreparedAttachmentRequest } from '../../../../../../lib/core/sync/requestSyncDatabaseExchange.js';
import type { RequestSyncFilePort } from '../../../../../../lib/core/sync/requestSyncFiles.js';

import { companionReceiveAttachment } from './companionAttachmentHttp.js';


export async function prepareCompanionReceive(files: RequestSyncFilePort,
  input: Parameters<typeof companionReceiveAttachment>[1], query: AttachmentRequest): Promise<PreparedAttachmentRequest> {
  const controller = new AbortController();
  const cancel = () => controller.abort(input.signal?.reason);
  if (input.signal?.aborted) cancel(); else input.signal?.addEventListener('abort', cancel, { once: true });
  const ready = gate(), dispatch = gate();
  let sent = false;
  const operation = companionReceiveAttachment(files, { ...input, signal: controller.signal,
    preparationGate: { ready: ready.resolve, dispatch: dispatch.promise } })(query);
  const settled = operation.then(() => undefined, (error: unknown) => error);
  try {
    await Promise.race([ready.promise, settled.then(error => { throw error ?? new Error('native_prepare_exited_before_dispatch'); })]);
  } catch (error) {
    input.signal?.removeEventListener('abort', cancel);
    throw error;
  }
  let closing: Promise<void> | undefined;
  return {
    send() { sent = true; dispatch.resolve(); return operation; },
    close() { return closing ??= (async () => {
      if (!sent) controller.abort(new Error('unused_native_preparation_closed'));
      await settled;
      input.signal?.removeEventListener('abort', cancel);
    })(); }
  };
}

function gate() {
  let resolve = () => {};
  const promise = new Promise<void>(done => { resolve = done; });
  return { resolve, promise };
}
