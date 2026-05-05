export type ReviewGrade = 1 | 2 | 3 | 4;
export type ReviewState = 0 | 1 | 2 | 3;

export interface SchedulerCard {
  due: string;
  last_review: string | null;
  state: ReviewState;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
}

export interface SchedulerGradeInput {
  card: SchedulerCard;
  grade: ReviewGrade;
  now: string;
}

export interface SchedulerPreviewInput {
  card: SchedulerCard;
  now: string;
}

export interface SchedulerGradeResult {
  card: SchedulerCard;
  reviewed_at: string;
}

export interface SchedulerPreviewResult {
  Again: SchedulerGradeResult;
  Hard: SchedulerGradeResult;
  Good: SchedulerGradeResult;
  Easy: SchedulerGradeResult;
}

export interface ReviewSchedulerAdapter {
  grade: (input: SchedulerGradeInput) => Promise<SchedulerGradeResult>;
  preview: (input: SchedulerPreviewInput) => Promise<SchedulerPreviewResult>;
}

export function createInitialSchedulerCard(now: string): SchedulerCard {
  return {
    due: now,
    last_review: null,
    state: 0,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0
  };
}

export function mapGradeToRustRating(grade: ReviewGrade): 'Again' | 'Hard' | 'Good' | 'Easy' {
  if (grade === 1) {
    return 'Again';
  }
  if (grade === 2) {
    return 'Hard';
  }
  if (grade === 3) {
    return 'Good';
  }
  return 'Easy';
}
