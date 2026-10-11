import { readNativeAppActiveState, subscribeNativeAppBackground } from '../../../appLifecycle.js';

/** A foreground request owns its cancellation until files and SQLite snapshots are released. */
export async function withCompanionRequestSyncLifecycle<T>(run: (signal: AbortSignal) => Promise<T>, parent?: AbortSignal) {
  const controller = new AbortController();
  const cancel = () => controller.abort(new Error('request_sync_foreground_ended'));
  const parentCancelled = () => controller.abort(parent?.reason);
  parent?.addEventListener('abort', parentCancelled, { once: true });
  let unsubscribe: (() => void) | undefined;
  try {
    parent?.throwIfAborted();
    unsubscribe = await subscribeNativeAppBackground(cancel);
    if (!await readNativeAppActiveState()) cancel();
    controller.signal.throwIfAborted();
    return await run(controller.signal);
  } finally {
    unsubscribe?.();
    parent?.removeEventListener('abort', parentCancelled);
  }
}
