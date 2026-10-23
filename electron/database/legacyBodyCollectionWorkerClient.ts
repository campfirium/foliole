import { runBodyCollectionWorker } from './bodyCollectionWorkerRun.js';

export function runLegacyBodyCollectionWorker(dbPath: string, limit: number, signal: AbortSignal): Promise<{ completed: boolean; paused?: boolean }> {
  return runBodyCollectionWorker(new URL('./legacyBodyCollectionWorker.js', import.meta.url), { dbPath, limit }, signal);
}
