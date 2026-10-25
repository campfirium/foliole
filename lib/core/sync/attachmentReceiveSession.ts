import { ATTACHMENT_BLOCK_BYTES, type AttachmentBlockFiles, type AttachmentBlockResource } from './attachmentBlockReceiver.js';
import { AttachmentReceivePaused, type AttachmentBlockDestination, type AttachmentReceiveWindow } from './attachmentBlockTransfer.js';

export interface AttachmentReceiveSessionOptions { signal?: AbortSignal; shouldYield(): boolean }
export interface AttachmentReceiveSession {
  receiveWindow: NonNullable<AttachmentBlockDestination['receiveWindow']>;
  settled(storageKey: string): Promise<void>;
  close(): Promise<void>;
}
type Result = { kind: 'complete' } | { kind: 'failed'; error: unknown };

/** Receive serially, retaining each file lease until its bounded asynchronous finalization settles. */
export function createAttachmentReceiveSession(files: AttachmentBlockFiles, options: AttachmentReceiveSessionOptions,
  commit: (resource: AttachmentBlockResource) => Promise<void>, invalidate: (resource: AttachmentBlockResource) => void): AttachmentReceiveSession {
  const active = new Set<Promise<Result>>();
  const completed = new Map<string, Promise<Result>>();
  let closed = false;
  const check = () => {
    options.signal?.throwIfAborted();
    if (options.shouldYield()) throw new AttachmentReceivePaused();
  };
  return {
    async receiveWindow(resource, offset, execute) {
      while (active.size >= 2) { await Promise.race(active); check(); }
      check();
      if (closed) throw new Error('attachment_receive_session_closed');
      const received = gate<Awaited<ReturnType<typeof execute>>>();
      const hash = resource.storageKey.slice(0, 64);
      const operation = files.exclusive(hash, async () => {
        check();
        const result = await execute();
        await validateWindow(files, resource, offset, result);
        if (result.offset !== resource.byteLength) { received.resolve(result); return; }
        received.resolve(result);
        await finish(files, resource, check, commit);
      });
      const task: Promise<Result> = operation.then(() => ({ kind: 'complete' }), (error: unknown) => {
        invalidate(resource);
        received.reject(error);
        return { kind: 'failed', error };
      });
      active.add(task);
      completed.set(resource.storageKey, task);
      void task.then(() => { active.delete(task); });
      return received.promise;
    },
    async settled(key) {
      const result = await completed.get(key);
      if (result?.kind === 'failed') throw result.error;
    },
    async close() {
      closed = true;
      await Promise.all(active);
    }
  };
}

async function validateWindow(files: AttachmentBlockFiles, resource: AttachmentBlockResource, offset: number,
  result: AttachmentReceiveWindow) {
  const expected = Math.min(resource.byteLength, offset + result.blocks * ATTACHMENT_BLOCK_BYTES);
  if (!Number.isInteger(result.blocks) || result.blocks < 0 || result.blocks > 64 || result.offset !== expected ||
    (!result.blocks && !result.pending && result.offset !== resource.byteLength) ||
    await files.partialLength(resource.storageKey.slice(0, 64)) !== result.offset) throw new Error('attachment_window_result_invalid');
}

async function finish(files: AttachmentBlockFiles, resource: AttachmentBlockResource, check: () => void,
  commit: (resource: AttachmentBlockResource) => Promise<void>) {
  const hash = resource.storageKey.slice(0, 64);
  check();
  const valid = await files.verifyPartial(hash);
  check();
  if (!valid) {
    await files.discardPartial(hash);
    throw new Error('attachment_checksum_mismatch');
  }
  await files.publish(resource, { notify: false });
  await commit(resource);
  files.notifyPublished?.(resource);
}

function gate<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { resolve, reject, promise };
}
