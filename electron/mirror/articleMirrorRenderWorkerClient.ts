import { Worker } from 'node:worker_threads';

import { renderSingleArticleMirror, type MirrorRenderableNode } from './articleMirrorOutput.js';

interface MirrorRenderWorkerInput {
  article: MirrorRenderableNode;
  derivedChildren: MirrorRenderableNode[];
  manualTopics: MirrorRenderableNode[];
}

interface MirrorRenderWorkerResult {
  error?: { message: string; stack?: string };
  markdown?: string;
}

const RENDER_TIMEOUT_MS = 30_000;

export function renderArticleMirrorInWorker(input: MirrorRenderWorkerInput, signal?: AbortSignal): Promise<string> {
  if (process.env.VITEST) {
    return Promise.resolve(renderSingleArticleMirror(input.article, input.derivedChildren, input.manualTopics));
  }
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const worker = new Worker(new URL('./articleMirrorRenderWorker.js', import.meta.url), { workerData: input });
    let result: MirrorRenderWorkerResult | null = null;
    const timeout = setTimeout(() => {
      void worker.terminate();
      reject(new Error('Article mirror render worker timed out.'));
    }, RENDER_TIMEOUT_MS);
    const abort = () => {
      void worker.terminate();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    };
    worker.once('message', (message: MirrorRenderWorkerResult) => { result = message; });
    worker.once('error', (error) => {
      cleanup();
      reject(error);
    });
    worker.once('exit', (code) => {
      cleanup();
      if (code !== 0 || !result) return reject(new Error(`Mirror render worker exited with code ${code}.`));
      if (result.error) {
        const error = new Error(result.error.message);
        if (result.error.stack) error.stack = result.error.stack;
        reject(error);
        return;
      }
      if (typeof result.markdown !== 'string') {
        reject(new Error('Article mirror render worker returned no markdown.'));
        return;
      }
      resolve(result.markdown);
    });
  });
}
