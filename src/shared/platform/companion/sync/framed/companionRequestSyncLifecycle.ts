import { readNativeAppActiveState, subscribeNativeAppEnteredBackground } from '../../../appLifecycle.js';
import { holdCompanionSyncScreenAwake } from '../../runtime/companionSyncScreenAwake.js';

export function combineCompanionRequestSignals(signals: readonly AbortSignal[]) {
  const controller = new AbortController();
  const subscriptions = signals.map(signal => {
    const cancel = () => controller.abort(signal.reason);
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    return () => signal.removeEventListener('abort', cancel);
  });
  return { signal: controller.signal, dispose: () => subscriptions.forEach(remove => remove()) };
}

/**
 * A foreground request owns its cancellation until files and SQLite snapshots are released.
 * The screen stays on while it runs; only actually leaving the screen ends it.
 */
export async function withCompanionRequestSyncLifecycle<T>(run: (signal: AbortSignal) => Promise<T>, parent?: AbortSignal) {
  const controller = new AbortController();
  const cancel = () => controller.abort(new Error('request_sync_foreground_ended'));
  const parentCancelled = () => controller.abort(parent?.reason);
  parent?.addEventListener('abort', parentCancelled, { once: true });
  let unsubscribe: (() => void) | undefined;
  let releaseScreen: (() => void) | undefined;
  try {
    parent?.throwIfAborted();
    unsubscribe = await subscribeNativeAppEnteredBackground(cancel);
    if (!await readNativeAppActiveState()) cancel();
    controller.signal.throwIfAborted();
    releaseScreen = holdCompanionSyncScreenAwake();
    return await run(controller.signal);
  } finally {
    releaseScreen?.();
    unsubscribe?.();
    parent?.removeEventListener('abort', parentCancelled);
  }
}
