import type { FlowGradeStage } from '../../lib/platform/supportRecordingEntry';
import type { ReviewGrade } from '../features/review/model/reviewTypes';

export interface WorkspaceReviewGradeObserver {
  stage: (stage: FlowGradeStage | null) => void;
  saved: (grade: ReviewGrade, cardId: string, due: string | null, reviewedAt: string, nextId: string | null) => void;
}
