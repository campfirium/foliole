import {
  assertSchedulerGradeInput,
  assertSchedulerGradeResult,
  assertSchedulerPreviewInput,
  assertSchedulerPreviewResult,
  mapGradeToRustRating,
  type ReviewSchedulerAdapter,
  type SchedulerGradeInput,
  type SchedulerGradeResult,
  type SchedulerPreviewInput,
  type SchedulerPreviewResult
} from '../core/review/index.js';

import type { NativeInvoke } from './nativeContract.js';
import { invokeReviewGrade, invokeReviewPreview } from './nativeInvoke.js';

export function createNativeReviewSchedulerAdapter(invoke: NativeInvoke): ReviewSchedulerAdapter {
  return {
    grade: async (input: SchedulerGradeInput): Promise<SchedulerGradeResult> => {
      assertSchedulerGradeInput(input);

      const result = await invokeReviewGrade(invoke, {
        request: {
          card: input.card,
          rating: mapGradeToRustRating(input.grade),
          now: input.now
        }
      });

      assertSchedulerGradeResult(result);
      return result;
    },
    preview: async (input: SchedulerPreviewInput): Promise<SchedulerPreviewResult> => {
      assertSchedulerPreviewInput(input);

      const result = await invokeReviewPreview(invoke, {
        request: {
          card: input.card,
          now: input.now
        }
      });

      assertSchedulerPreviewResult(result);
      return result;
    }
  };
}
