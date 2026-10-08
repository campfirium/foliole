import type { ClientRequest, ServerResponse } from 'node:http';
import type { Writable } from 'node:stream';
import { finished } from 'node:stream/promises';

import { encodeFramedSyncStream, type FramedSyncStreamBody } from './desktopFramedSyncStream.js';

/** Spool owners can send their authenticated bytes without parsing and re-encoding frames. */
export async function* encodeFramedSyncHttpBody(body: FramedSyncStreamBody & { dispose?: () => Promise<void> }) {
  try { yield* body.encodedBytes ?? encodeFramedSyncStream(body); }
  finally { await body.dispose?.(); }
}

export async function writeDesktopFramedSyncHttpBody(
  target: ClientRequest | ServerResponse | Writable, body: AsyncIterable<Uint8Array>
) {
  let rejectWrite: ((error: Error) => void) | undefined;
  const onError = (error: Error) => rejectWrite?.(error);
  const onClose = () => {
    if (!target.writableFinished) rejectWrite?.(new Error('framed_sync_http_stream_closed'));
  };
  target.on('error', onError);
  target.on('close', onClose);
  const completion = finished(target, { cleanup: true, readable: false });
  void completion.catch(() => {});
  try {
    for await (const chunk of body) {
      if (!chunk.byteLength) continue;
      await new Promise<void>((resolve, reject) => {
        rejectWrite = reject;
        target.write(chunk, (error?: Error | null) => error ? reject(error) : resolve());
      });
      rejectWrite = undefined;
    }
    target.end();
    await completion;
  } catch (error) {
    target.destroy(error instanceof Error ? error : undefined);
    await completion.catch(() => {});
    throw error;
  } finally {
    rejectWrite = undefined;
    target.off('error', onError);
    target.off('close', onClose);
  }
}
