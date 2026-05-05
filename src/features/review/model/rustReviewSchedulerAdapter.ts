import { assertSchedulerGradeInput, assertSchedulerGradeResult } from './reviewSchedulerContract';
import {
  mapGradeToRustRating,
  type ReviewSchedulerAdapter,
  type SchedulerGradeInput,
  type SchedulerGradeResult
} from './reviewTypes';

type RustInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

export function createRustReviewSchedulerAdapter(invoke: RustInvoke): ReviewSchedulerAdapter {
  return {
    grade: async (input: SchedulerGradeInput): Promise<SchedulerGradeResult> => {
      assertSchedulerGradeInput(input);

      const result = await invoke('review_grade', {
        request: {
          card: input.card,
          rating: mapGradeToRustRating(input.grade),
          now: input.now
        }
      });

      assertSchedulerGradeResult(result);
      return result;
    }
  };
}
