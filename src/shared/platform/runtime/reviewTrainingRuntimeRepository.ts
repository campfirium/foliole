import type { ReviewTrainingModel } from '../../../../lib/core/review/trainingModel.js';
import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands.js';
import { getRuntimeInvoke } from '../runtimeInvoke';

function invoke() {
  const runtime = getRuntimeInvoke();
  if (!runtime) throw new Error('review_training_runtime_unavailable');
  return runtime;
}

export function loadReviewTrainingPlan() { return invoke()(NATIVE_COMMANDS.loadReviewTrainingPlan); }
export function loadReviewTrainingInput(folderId: string | null, libraryScope: string) {
  return invoke()(NATIVE_COMMANDS.loadReviewTrainingInput, { folderId, libraryScope });
}
export function saveReviewTrainingModel(model: ReviewTrainingModel, libraryScope: string) {
  return invoke()(NATIVE_COMMANDS.saveReviewTrainingModel, { model, libraryScope });
}
