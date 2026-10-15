import { SYNC_SESSION_PATH, type SyncSessionRequest } from '../../../../../lib/platform/syncSessionContract.js';
import { FolioleCompanionSync } from '../../companionWorkspaceRuntimeRepository.js';
import { companionFramedFileOwner } from '../runtime/companionFramedPayloadBudget.js';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap.js';

import { createSignedRequestHeaders } from './signedRequest.js';

export async function requestCompanionSyncSession(endpointUrl: string, input: SyncSessionRequest,
  signal?: AbortSignal): Promise<unknown> {
  const pathWithQuery = `${SYNC_SESSION_PATH}?input=${encodeURIComponent(JSON.stringify(input))}`;
  const method = input.operation === 'wait' ? 'GET' : 'POST';
  const headers = await createSignedRequestHeaders({ endpointUrl, method, pathWithQuery });
  signal?.throwIfAborted();
  const owner = companionFramedFileOwner(getIosCompanionDatabaseOwner());
  const request = { ...owner, request_id: crypto.randomUUID() };
  const pending = FolioleCompanionSync.desktopHttpRequest({ ...request, headers, method, url: `${endpointUrl}${pathWithQuery}` });
  const cancel = () => { void FolioleCompanionSync.cancelRequestSyncHttp(request).catch(() => undefined); };
  signal?.addEventListener('abort', cancel, { once: true });
  const response = await pending.finally(() => signal?.removeEventListener('abort', cancel));
  signal?.throwIfAborted();
  if (response.status !== 200) throw new Error(`sync_session_http_${response.status}`);
  return JSON.parse(response.body);
}
