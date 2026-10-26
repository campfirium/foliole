import type { ReviewTrainingInput, ReviewTrainingModel } from '../../../../lib/core/review/trainingModel.js';

export function runReviewTrainingWorker(input: ReviewTrainingInput, signal?: AbortSignal): Promise<ReviewTrainingModel> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./reviewTraining.worker.ts', import.meta.url), { type: 'module' });
    const cleanup = () => { signal?.removeEventListener('abort', abort); worker.terminate(); };
    const abort = () => { cleanup(); reject(new Error('review_training_cancelled')); };
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }: MessageEvent<{ model?: ReviewTrainingModel; error?: string }>) => {
      cleanup();
      if (data.error || !data.model) reject(new Error(data.error ?? 'review_training_result_missing'));
      else resolve(data.model);
    };
    worker.onerror = event => { cleanup(); reject(new Error(event.message)); };
    worker.postMessage(input);
  });
}
