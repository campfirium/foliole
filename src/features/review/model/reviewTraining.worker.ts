import init from 'fsrs-browser/fsrs_browser.js';
import wasmUrl from 'fsrs-browser/fsrs_browser_bg.wasm?url';

import type { ReviewTrainingInput } from '../../../../lib/core/review/trainingModel.js';

import { trainFolderReviewModel } from './trainFolderReviewModel.js';

self.onmessage = async (event: MessageEvent<ReviewTrainingInput>) => {
  try {
    await init({ module_or_path: wasmUrl });
    self.postMessage({ model: trainFolderReviewModel(event.data) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
