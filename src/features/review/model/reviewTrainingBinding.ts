import { instantiate } from '@open-spaced-repetition/binding-wasm32-wasip1/workerd';

let binding: Awaited<ReturnType<typeof instantiate>> | null = null;

export async function initializeReviewTrainingBinding(module: WebAssembly.Module) {
  binding = await instantiate(module);
}

export function hasReviewTrainingBinding() { return binding !== null; }

export function getReviewTrainingBinding() {
  if (!binding) throw new Error('review_training_engine_not_initialized');
  return binding;
}
