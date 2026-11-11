import type { FramedSyncFilePort } from '../../../../../lib/core/sync/framedSyncFilePort.js';
import type { WebDavRelayMethod, WebDavRelayRequest } from '../../../../../lib/core/sync/webDavRelayPublication.js';
import { consumeWebDavResponse } from '../../../../../lib/core/sync/webDavRetryAfter.js';
import type { NativeCompanionFramedPayloadBudgetOwner } from '../../../../../lib/platform/nativeCompanionFramedPayloadBudgetContract.js';
import type { NativeWebDavRelayCredentialReference } from '../../../../../lib/platform/nativeWebDavRelayHttpContract.js';
import { FolioleCompanionSync } from '../../companionWorkspaceRuntimeRepository.js';

export type CompanionWebDavHttpStats = {
  requests: Partial<Record<WebDavRelayMethod, number>>;
  responses: number;
  uploadedBytes: number;
  downloadedBytes: number;
};

export function createCompanionWebDavRelayHttp(root: string, files: FramedSyncFilePort,
  owner: NativeCompanionFramedPayloadBudgetOwner, stats: CompanionWebDavHttpStats, signal: AbortSignal,
  credential?: NativeWebDavRelayCredentialReference): WebDavRelayRequest {
  return async (url, input, consume) => {
    signal.throwIfAborted();
    const requestId = crypto.randomUUID();
    const directory = `requests/${requestId}`;
    const range = input.body?.fileRange;
    if (input.body && !range) throw new Error('webdav_relay_pending_bytes_missing');
    const pending = FolioleCompanionSync.requestWebDavRelay({
      ...owner, request_id: requestId, root, url: url.href, method: input.method,
      ...(credential ? { credential } : {}),
      ...(input.headers?.Depth ? { depth: input.headers.Depth } : {}),
      ...(range ? { upload_directory: range.directory, upload_chunks: range.count, upload_bytes: String(input.body!.bytes) } : {})
    });
    const cancel = () => { void FolioleCompanionSync.cancelWebDavRelay({ ...owner, request_id: requestId }).catch(() => undefined); };
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    try {
      const response = await pending;
      if (response.failure_code === 'credential_unavailable') throw new Error('webdav_relay_credentials_unavailable');
      stats.requests[input.method] = (stats.requests[input.method] ?? 0) + 1;
      if (response.status) stats.responses++;
      stats.uploadedBytes += response.uploaded_bytes;
      stats.downloadedBytes += response.downloaded_bytes;
      signal.throwIfAborted();
      if (response.failed && response.status !== 429 && response.status !== 503) {
        const code = response.failure_code;
        throw new Error(code && /^[a-z_]+$/iu.test(code)
          ? `webdav_relay_transport_failed:${code}` : 'webdav_relay_transport_failed');
      }
      return await consumeWebDavResponse(response.status, response.retry_after,
        responseChunks(files, directory, response.chunks, signal), consume);
    } finally {
      signal.removeEventListener('abort', cancel);
      await files.remove(directory);
    }
  };
}

async function* responseChunks(files: FramedSyncFilePort, directory: string, count: number, signal: AbortSignal) {
  for (let index = 0; index < count; index++) {
    signal.throwIfAborted();
    const bytes = await files.read(`${directory}/${index}`);
    if (!bytes) throw new Error('webdav_relay_response_missing');
    yield bytes;
  }
}
