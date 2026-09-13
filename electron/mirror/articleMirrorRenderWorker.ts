import { parentPort, workerData } from 'node:worker_threads';

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

function run(input: MirrorRenderWorkerInput): MirrorRenderWorkerResult {
  try {
    return {
      markdown: renderSingleArticleMirror(input.article, input.derivedChildren, input.manualTopics)
    };
  } catch (error) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    return {
      error: {
        message: normalized.message,
        ...(normalized.stack ? { stack: normalized.stack } : {})
      }
    };
  }
}

parentPort?.postMessage(run(workerData as MirrorRenderWorkerInput));
