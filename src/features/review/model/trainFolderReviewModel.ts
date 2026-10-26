import { DEFAULT_PARAMETERS, Fsrs } from 'fsrs-browser/fsrs_browser.js';

import { evaluateReviewTraining } from '../../../../lib/core/review/trainingEvaluation.js';
import { prepareTrainingHistory, reviewTrainingCutoff, trainingAnkiArrays } from '../../../../lib/core/review/trainingHistory.js';
import { REVIEW_TRAINING_ENGINE, type ReviewTrainingInput, type ReviewTrainingModel } from '../../../../lib/core/review/trainingModel.js';

/** Caller initializes wasm once in its single-thread Worker. */
export function trainFolderReviewModel(input: ReviewTrainingInput): ReviewTrainingModel {
  if (input.folderId === null) throw new Error('review_training_folder_invalid');
  const histories = prepareTrainingHistory(input.events);
  const cutoff = reviewTrainingCutoff(input.events);
  const baseWeights = input.baselineWeights ?? Array.from(DEFAULT_PARAMETERS());
  const baselineModel = new Fsrs(Float32Array.from(baseWeights));
  const candidateModel = new Fsrs();
  try {
    const baseline = evaluateReviewTraining(baselineModel, baseWeights, histories, cutoff);
    const arrays = trainingAnkiArrays(histories, cutoff);
    const canTrain = histories.some(history => history.times.some((time, index) =>
      time < cutoff && history.deltas[index]! > 0));
    const weights = canTrain && baseline ? Array.from(candidateModel.computeParametersAnki(
      0, arrays.cids, arrays.eases, arrays.ids, arrays.types, undefined, input.enableShortTerm
    )) : Array.from(DEFAULT_PARAMETERS());
    const candidate = canTrain && baseline ? evaluateReviewTraining(candidateModel, weights, histories, cutoff) : null;
    const enabled = Boolean(candidate && baseline && candidate.logLoss < baseline.logLoss - 1e-6
      && candidate.rmse < baseline.rmse - 1e-6);
    return { folderId: input.folderId, reviewCount: input.reviewCount, engine: REVIEW_TRAINING_ENGINE,
      weights, enabled, candidate, baseline, trainedAt: new Date().toISOString() };
  } finally { baselineModel.free(); candidateModel.free(); }
}
