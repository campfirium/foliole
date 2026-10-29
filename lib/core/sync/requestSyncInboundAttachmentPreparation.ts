import { createRequestSyncAttachmentPreparation } from './requestSyncAttachmentPreparation.js';
import type { RequestSyncDatabaseHost } from './requestSyncObjectEndpoint.js';

// The existing lease signal identifies one library generation and inbound lifecycle, not a network scheduler.
const preparations = new WeakMap<AbortSignal, ReturnType<typeof createRequestSyncAttachmentPreparation>>();

export async function withInboundAttachmentPreparation<T>(host: RequestSyncDatabaseHost, input: {
  lifecycle: AbortSignal; signal: AbortSignal; mode: string; single: boolean;
}, execute: (prepared: RequestSyncDatabaseHost) => Promise<T>) {
  input.lifecycle.throwIfAborted();
  let preparation = preparations.get(input.lifecycle);
  if (!preparation) {
    preparation = createRequestSyncAttachmentPreparation(host, input.lifecycle);
    preparations.set(input.lifecycle, preparation);
    const owned = preparation;
    input.lifecycle.addEventListener('abort', () => {
      preparations.delete(input.lifecycle);
      // cancel always settles its owned task; errors are retained for the active request to report.
      void owned.cancel(input.lifecycle.reason);
    }, { once: true });
  }
  let preparationFinished = false;
  try {
    input.signal.throwIfAborted();
    if (input.mode === 'attachments' || input.mode === 'round_finish') {
      await preparation.finish();
      preparationFinished = true;
    }
    const result = await execute(preparation.bind(host, input.signal));
    if (input.single) await preparation.finish();
    input.signal.throwIfAborted();
    return result;
  } catch (error) {
    if (input.mode !== 'attachments' || !preparationFinished || input.signal.aborted || input.lifecycle.aborted) {
      await preparation.cancel(error);
    }
    throw error;
  }
}
