import type { ReviewTrainingModel } from '../../../../lib/core/review/trainingModel.js';
import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands.js';
import { isNativeCompanionRuntime } from '../companionBootstrap';
import { getRuntimeInvoke } from '../runtimeInvoke';

function invoke() {
  const runtime = getRuntimeInvoke();
  if (!runtime) throw new Error('review_training_runtime_unavailable');
  return runtime;
}

export async function loadReviewTrainingPlan() {
  if (isNativeCompanionRuntime()) return (await import('../companion/runtime/companionReviewTraining')).loadCompanionReviewTrainingPlan();
  return invoke()(NATIVE_COMMANDS.loadReviewTrainingPlan);
}
export async function loadReviewTrainingInput(folderId: string | null, libraryScope: string) {
  if (isNativeCompanionRuntime()) return (await import('../companion/runtime/companionReviewTraining')).loadCompanionReviewTrainingInput(folderId, libraryScope);
  return invoke()(NATIVE_COMMANDS.loadReviewTrainingInput, { folderId, libraryScope });
}
export async function saveReviewTrainingModel(model: ReviewTrainingModel, libraryScope: string) {
  if (isNativeCompanionRuntime()) return (await import('../companion/runtime/companionReviewTraining')).saveCompanionReviewTrainingModel(model, libraryScope);
  return invoke()(NATIVE_COMMANDS.saveReviewTrainingModel, { model, libraryScope });
}
