import {
  mapGradeToRustRating,
  type ReviewSchedulerAdapter,
  type SchedulerGradeInput,
  type SchedulerGradeResult
} from './reviewTypes';

type RustInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export function createRustReviewSchedulerAdapter(invoke: RustInvoke): ReviewSchedulerAdapter {
  return {
    grade: async (input: SchedulerGradeInput): Promise<SchedulerGradeResult> => {
      return invoke<SchedulerGradeResult>('review_grade', {
        card: input.card,
        rating: mapGradeToRustRating(input.grade),
        now: input.now
      });
    }
  };
}
