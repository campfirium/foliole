import type { ServerResponse } from 'node:http';

import { FRAMED_SYNC_CONTENT_TYPE, FRAMED_SYNC_DEVICE_ID_HEADER,
  FRAMED_SYNC_LIBRARY_EPOCH_HEADER } from '../../lib/core/sync/framedSyncHttpContract.js';
import type { FramedSyncPayloadBudget } from '../../lib/core/sync/framedSyncPayloadBudget.js';
import { leaseFramedSyncPayloads } from '../../lib/core/sync/framedSyncPayloadLease.js';

import { beginRequestHttpPhase } from './companionLanRequestTiming.js';
import { encodeFramedSyncHttpBody, writeDesktopFramedSyncHttpBody } from './desktopFramedSyncHttpWriter.js';
import type { FramedSyncStreamBody } from './desktopFramedSyncStream.js';

/** The caller retains the verified source until the writer and its frame iterator exit. */
export async function writeDesktopAttachmentPull(input: {
  response: ServerResponse; stream: FramedSyncStreamBody; signal: AbortSignal | undefined;
  payloadBudget: FramedSyncPayloadBudget | undefined;
  localIdentity: Readonly<{ deviceId: string; libraryEpoch: string }>;
  onProgress: (() => void) | undefined;
}) {
  const disconnected = new AbortController();
  const closed = () => disconnected.abort(new Error('attachment_response_closed'));
  const signal = input.signal ? AbortSignal.any([input.signal, disconnected.signal]) : disconnected.signal;
  const abort = () => input.response.destroy(new Error('attachment_response_aborted'));
  input.response.once('close', closed);
  signal.addEventListener('abort', abort, { once: true });
  const sent = beginRequestHttpPhase(input.response, 'response_send');
  try {
    if (input.response.destroyed) closed();
    signal.throwIfAborted();
    input.response.writeHead(200, {
      'Content-Type': FRAMED_SYNC_CONTENT_TYPE,
      [FRAMED_SYNC_DEVICE_ID_HEADER]: input.localIdentity.deviceId,
      [FRAMED_SYNC_LIBRARY_EPOCH_HEADER]: input.localIdentity.libraryEpoch
    });
    const frames = leaseFramedSyncPayloads(input.stream.frames, input.payloadBudget, 'outbound', undefined, signal);
    await writeDesktopFramedSyncHttpBody(input.response, (async function* () {
      for await (const bytes of encodeFramedSyncHttpBody({ ...input.stream, frames })) {
        signal.throwIfAborted();
        input.onProgress?.();
        yield bytes;
      }
    })());
  } finally {
    signal.removeEventListener('abort', abort);
    input.response.off('close', closed);
    sent();
  }
}
