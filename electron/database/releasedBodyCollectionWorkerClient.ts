import { runBodyCollectionWorker } from './bodyCollectionWorkerRun.js';

export function runReleasedBodyCollectionWorker(
  dbPath: string,
  hashes: string[],
  signal: AbortSignal
): Promise<{ deletedHashes: string[]; deletedBytes: number }> {
  return runBodyCollectionWorker(new URL('./releasedBodyCollectionWorker.js', import.meta.url), { dbPath, hashes }, signal);
}
