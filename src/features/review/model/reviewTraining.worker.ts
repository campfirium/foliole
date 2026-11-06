import wasmUrl from '@open-spaced-repetition/binding-wasm32-wasip1/wasm.wasm?url';

import type { ReviewTrainingInput } from '../../../../lib/core/review/trainingModel.js';

import { hasReviewTrainingBinding, initializeReviewTrainingBinding } from './reviewTrainingBinding.js';
import { trainFolderReviewModel } from './trainFolderReviewModel.js';

self.onmessage = async (event: MessageEvent<ReviewTrainingInput>) => {
  try {
    if (!hasReviewTrainingBinding()) {
      const response = await fetch(wasmUrl);
      if (!response.ok) throw new Error(`review_training_engine_load_failed:${response.status}`);
      await initializeReviewTrainingBinding(await WebAssembly.compile(await response.arrayBuffer()));
    }
    self.postMessage({ model: await trainFolderReviewModel(event.data) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
