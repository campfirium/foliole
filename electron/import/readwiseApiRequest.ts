import { canCurrentHostRunReadwise, loadReadwiseHostAssignment } from '../database/readwiseHostAssignment.js';
import { loadReadwiseRemoteSource } from '../database/readwiseRemoteIdentity.js';

import { saveReconnectRequired } from './readwiseApiConnection.js';
import { loadStoredReadwiseHostSettings } from './readwiseApiConnectionState.js';

export interface ReadwiseApiFetchDependencies {
  allowFolderModeForCutover?: boolean;
  fetchImpl?: typeof fetch;
  minIntervalMs?: number;
  onPage?: (input: { phase: 'export' | 'reader'; recordCount: number; totalCount?: number }) => void;
  signal?: AbortSignal;
}

export function createReadwiseRequest(
  token: string,
  dependencies: ReadwiseApiFetchDependencies,
  connectionRef?: string
) {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const minIntervalMs = dependencies.minIntervalMs ?? 3_100;
  let lastRequestAt = 0;
  return async (url: URL) => {
    for (let retry = 0; retry <= 2; retry += 1) {
      const delay = Math.max(0, lastRequestAt + minIntervalMs - Date.now());
      if (delay) await abortableDelay(delay, dependencies.signal);
      assertReadwiseApiEligible(dependencies.signal, connectionRef, dependencies.allowFolderModeForCutover);
      lastRequestAt = Date.now();
      const requestSignal = dependencies.signal
        ? AbortSignal.any([AbortSignal.timeout(30_000), dependencies.signal])
        : AbortSignal.timeout(30_000);
      let response: Response;
      try {
        response = await fetchImpl(url, {
          headers: { Authorization: `Token ${token}` }, method: 'GET', redirect: 'error', signal: requestSignal
        });
      } catch (error) {
        if (retry >= 2) throw error;
        await abortableDelay(transientRetryDelay(retry, dependencies), dependencies.signal);
        continue;
      }
      if (response.status === 401 || response.status === 403) {
        saveReconnectRequired(loadStoredReadwiseHostSettings());
        throw new Error('readwise_api_reconnect_required');
      }
      if (response.status === 429 && retry < 2) {
        const retryAfter = Math.max(1, Number(response.headers.get('retry-after')) || 1);
        await abortableDelay(retryAfter * 1_000, dependencies.signal);
        continue;
      }
      if (response.status === 429) {
        throw new Error(`readwise_api_rate_limited:${response.headers.get('retry-after') ?? ''}`);
      }
      if (response.status >= 500 && retry < 2) {
        await abortableDelay(transientRetryDelay(retry, dependencies), dependencies.signal);
        continue;
      }
      if (!response.ok) throw new Error(`readwise_api_http_${response.status}`);
      return response.json() as Promise<Record<string, unknown>>;
    }
    throw new Error('readwise_api_request_retry_exhausted');
  };
}

export function assertReadwiseApiEligible(
  signal?: AbortSignal,
  connectionRef?: string,
  allowFolderMode = false
) {
  if (signal?.aborted) throw new DOMException('Readwise import cancelled', 'AbortError');
  if (!(canCurrentHostRunReadwise('api') || (allowFolderMode && loadReadwiseHostAssignment().is_active))) {
    throw new Error('readwise_execution_eligibility_lost');
  }
  if (connectionRef && loadReadwiseRemoteSource()?.connectionRef !== connectionRef) {
    throw new Error('readwise_execution_connection_changed');
  }
}

export function canRunReadwiseApiRequest(dependencies: ReadwiseApiFetchDependencies) {
  return canCurrentHostRunReadwise('api') || (
    dependencies.allowFolderModeForCutover === true && loadReadwiseHostAssignment().is_active
  );
}

function transientRetryDelay(retry: number, dependencies: ReadwiseApiFetchDependencies) {
  return dependencies.minIntervalMs === 0 ? 0 : 1_000 * (2 ** retry);
}

function abortableDelay(delay: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, delay);
    signal?.addEventListener('abort', () => {
      clearTimeout(timeout);
      reject(new DOMException('Readwise import cancelled', 'AbortError'));
    }, { once: true });
  });
}
