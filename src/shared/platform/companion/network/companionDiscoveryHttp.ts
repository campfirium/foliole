import { FolioleCompanionSync } from '../../companionWorkspaceRuntimeRepository';
import { companionFramedFileOwner } from '../runtime/companionFramedPayloadBudget';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

export async function requestNativeDiscovery(url: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const request = { ...companionFramedFileOwner(getIosCompanionDatabaseOwner()), request_id: crypto.randomUUID() };
  const pending = FolioleCompanionSync.desktopHttpRequest({ ...request, method: 'GET', url });
  return new Promise<Awaited<typeof pending>>((resolve, reject) => {
    const abort = () => {
      void FolioleCompanionSync.cancelRequestSyncHttp(request).catch(() => undefined);
      reject(signal.reason);
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    void pending.then(value => { signal.throwIfAborted(); resolve(value); }, reject)
      .catch(reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
