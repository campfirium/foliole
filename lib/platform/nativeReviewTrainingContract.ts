import type { ReviewTrainingInput, ReviewTrainingModel } from '../core/review/trainingModel.js';

import { NATIVE_COMMANDS } from './nativeCommands.js';

export interface ReviewTrainingPlan {
  folders: Array<{ folderId: string; reviewCount: number }>;
  lastTrainedAt: string | null;
  lastTrainedFolderId: string | null;
  libraryScope: string;
}

export interface NativeReviewTrainingCommandMap {
  [NATIVE_COMMANDS.loadReviewTrainingPlan]: { args: undefined; result: ReviewTrainingPlan };
  [NATIVE_COMMANDS.loadReviewTrainingInput]: { args: { folderId: string | null; libraryScope: string }; result: ReviewTrainingInput };
  [NATIVE_COMMANDS.saveReviewTrainingModel]: { args: { model: ReviewTrainingModel; libraryScope: string }; result: null };
}
