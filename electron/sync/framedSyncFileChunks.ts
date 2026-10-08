import { open } from 'node:fs/promises';

/** Borrowed bytes remain valid until the consumer requests the next chunk. */
export async function* readFramedSyncFileChunks(path: string, bytes = 64 * 1024) {
  const file = await open(path, 'r');
  const buffer = Buffer.allocUnsafe(bytes);
  try {
    for (;;) {
      let length = 0;
      while (length < buffer.byteLength) {
        const { bytesRead } = await file.read(buffer, length, buffer.byteLength - length);
        if (bytesRead === 0) break;
        length += bytesRead;
      }
      if (length === 0) return;
      yield buffer.subarray(0, length);
      if (length < buffer.byteLength) return;
    }
  } finally { await file.close(); }
}
