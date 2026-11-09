import type { FramedSyncFilePort } from '../../../../../lib/core/sync/framedSyncFilePort.js';
import type { WebDavRelayMethod, WebDavRelayRequest } from '../../../../../lib/core/sync/webDavRelayPublication.js';
import type { NativeCompanionFramedPayloadBudgetOwner } from '../../../../../lib/platform/nativeCompanionFramedPayloadBudgetContract.js';
import { FolioleCompanionSync } from '../../companionWorkspaceRuntimeRepository.js';

export type CompanionWebDavHttpStats = {
  requests: Partial<Record<WebDavRelayMethod, number>>;
  responses: number;
  uploadedBytes: number;
  downloadedBytes: number;
};

export function createCompanionWebDavRelayHttp(root: string, files: FramedSyncFilePort,
  owner: NativeCompanionFramedPayloadBudgetOwner, stats: CompanionWebDavHttpStats, signal: AbortSignal): WebDavRelayRequest {
  return async (url, input, consume) => {
    signal.throwIfAborted();
    const requestId = crypto.randomUUID();
    const directory = `requests/${requestId}`;
    const range = input.body?.fileRange;
    if (input.body && !range) throw new Error('webdav_relay_pending_bytes_missing');
    const pending = FolioleCompanionSync.requestWebDavRelay({
      ...owner, request_id: requestId, root, url: url.href, method: input.method,
      ...(input.headers?.Depth ? { depth: input.headers.Depth } : {}),
      ...(range ? { upload_directory: range.directory, upload_chunks: range.count, upload_bytes: String(input.body!.bytes) } : {})
    });
    stats.requests[input.method] = (stats.requests[input.method] ?? 0) + 1;
    const cancel = () => { void FolioleCompanionSync.cancelWebDavRelay({ ...owner, request_id: requestId }).catch(() => undefined); };
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    try {
      const response = await pending;
      if (response.status) stats.responses++;
      stats.uploadedBytes += response.uploaded_bytes;
      stats.downloadedBytes += response.downloaded_bytes;
      signal.throwIfAborted();
      if (response.failed) throw new Error('webdav_relay_transport_failed');
      return await consume(response.status, responseChunks(files, directory, response.chunks, signal));
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
