import {
  invokeReviewGrade,
  invokeReviewPreview,
  type NativeInvoke
} from '../../../../lib/platform/nativeContract';

import {
  assertSchedulerGradeInput,
  assertSchedulerGradeResult,
  assertSchedulerPreviewInput,
  assertSchedulerPreviewResult
} from './reviewSchedulerContract';
import {
  mapGradeToRustRating,
  type ReviewSchedulerAdapter,
  type SchedulerGradeInput,
  type SchedulerGradeResult,
  type SchedulerPreviewInput,
  type SchedulerPreviewResult
} from './reviewTypes';

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
