import { FSRS7_DEFAULT_WEIGHTS } from 'ts-fsrs/models/fsrs-7';

import { evaluateReviewTraining } from '../../../../lib/core/review/trainingEvaluation.js';
import { prepareTrainingHistory, reviewTrainingCutoff, trainingReviewCsv } from '../../../../lib/core/review/trainingHistory.js';
import { REVIEW_TRAINING_ENGINE, type ReviewTrainingInput, type ReviewTrainingModel } from '../../../../lib/core/review/trainingModel.js';

import { getReviewTrainingBinding } from './reviewTrainingBinding.js';

/** Caller initializes a single-thread WASI engine in its disposable Worker. */
export async function trainFolderReviewModel(input: ReviewTrainingInput): Promise<ReviewTrainingModel> {
  if (input.folderId === null) throw new Error('review_training_folder_invalid');
  const histories = prepareTrainingHistory(input.events);
  const cutoff = reviewTrainingCutoff(input.events);
  const baseWeights = input.baselineWeights ?? [...FSRS7_DEFAULT_WEIGHTS];
  const baseline = evaluateReviewTraining(baseWeights, histories, cutoff);
  const binding = getReviewTrainingBinding();
  // UTC days match scheduling's absolute fractional-day policy, regardless of the device's timezone.
  const { items, cardIds } = binding.convertCsvToFsrsItemsWithCardIds(
    new TextEncoder().encode(trainingReviewCsv(histories, cutoff)), 0, 'UTC', 'FSRS-7');
  const canTrain = items.length > 0 && baseline !== null;
  const options = {
    modelVersion: 'FSRS-7' as const,
    enableShortTerm: true,
    cardIds,
    disableRecencyWeighting: input.recencyWeighting === false,
    enableSchedPenalties: input.reviewIntervalPenalties === true
  };
  const weights = canTrain ? await binding.computeParameters(items, options) : [...FSRS7_DEFAULT_WEIGHTS];
  const candidate = canTrain ? evaluateReviewTraining(weights, histories, cutoff) : null;
  const enabled = Boolean(candidate && baseline && candidate.logLoss < baseline.logLoss - 1e-6
    && candidate.rmse < baseline.rmse - 1e-6);
  return { folderId: input.folderId, reviewCount: input.reviewCount, engine: REVIEW_TRAINING_ENGINE,
    weights, enabled, candidate, baseline, trainedAt: new Date().toISOString() };
}
