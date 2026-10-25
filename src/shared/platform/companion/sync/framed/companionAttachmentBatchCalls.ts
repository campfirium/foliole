import type { NativeAttachmentBatchCommand } from '../../../../../../lib/platform/nativeAttachmentBatchContract.js';
import { FolioleCompanionSync } from '../../../companionWorkspaceRuntimeRepository.js';

/** Metadata commands cannot legitimately wait behind a file hash or the HTTP executor. */
export async function attachmentBatchMetadata(command: NativeAttachmentBatchCommand) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([FolioleCompanionSync.attachmentBatch(command), new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('attachment_batch_handoff_timeout')), 60_000);
    })]);
  } finally { clearTimeout(timer); }
}

export function attachmentBatchDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  void promise.catch(() => undefined);
  return { promise, resolve, reject };
}
