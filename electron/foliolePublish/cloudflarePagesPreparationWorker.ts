import { parentPort, workerData } from 'node:worker_threads';

import { prepareCloudflarePagesFiles } from './cloudflarePagesAssets.js';

export type CloudflarePagesPreparationResult =
  | { files: Array<{ body: Uint8Array<ArrayBuffer>; contentType: string; hash: string; relativePath: string }> }
  | { error: string };

try {
  const files = prepareCloudflarePagesFiles(workerData as string).map((file) => ({
    ...file,
    // Own every backing buffer: pooled Buffers must never cross the worker boundary.
    body: Uint8Array.from(file.body)
  }));
  parentPort?.postMessage({ files } satisfies CloudflarePagesPreparationResult, files.map((file) => file.body.buffer));
} catch (error) {
  parentPort?.postMessage({ error: error instanceof Error ? error.message : String(error) } satisfies CloudflarePagesPreparationResult);
}
