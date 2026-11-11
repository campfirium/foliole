import { ZodError } from 'zod';

import { WebDavServiceBusyError } from './webDavRetryAfter.js';
import { isRetryableWebDavSendError } from './webDavTransportRetry.js';

const contentErrors = new Set([
  'attachment_checksum_mismatch', 'attachment_response_identity_mismatch',
  'frame_authentication_failed', 'frame_payload_type_mismatch', 'frame_sequence_not_contiguous',
  'framed_sync_preamble_invalid', 'framed_sync_frame_header_invalid',
  'framed_sync_preamble_truncated', 'framed_sync_frame_header_truncated', 'framed_sync_frame_body_truncated',
  'request_sync_frame_type_invalid', 'session_context_mismatch', 'session_preamble_required',
  'session_starting_sequence_invalid', 'webdav_relay_attachment_invalid', 'webdav_relay_attachment_incomplete',
  'webdav_relay_repair_invalid', 'webdav_relay_download_failed:404'
]);

function contentFault(error: unknown) {
  return error instanceof ZodError || (error instanceof Error && contentErrors.has(error.message));
}

export async function readWebDavRelayPacket<T>(read: () => Promise<T>, retry: (count: number) => void, signal?: AbortSignal) {
  try { return { value: await read() }; }
  catch (error) {
    signal?.throwIfAborted();
    if (error instanceof WebDavServiceBusyError) throw error;
    if (!contentFault(error) && !isRetryableWebDavSendError(error)) throw error;
    retry(1);
    try { return { value: await read() }; }
    catch (second) {
      signal?.throwIfAborted();
      if (!contentFault(second)) throw second;
      if (!contentFault(error)) throw error;
      return { damaged: true as const };
    }
  }
}
