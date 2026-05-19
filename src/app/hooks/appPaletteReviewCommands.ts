import { APP_COMMAND_IDS } from '../../shared/commands/ids';

export interface ReviewPaletteCommandOptions {
  canRevealAnswer: boolean;
  canToggleReviewMode: boolean;
  canGradeReview: boolean;
  canDeferReadingReview: boolean;
  canCompleteReadingReview: boolean;
  canDismissReadingReview: boolean;
  canDeleteReviewItem: boolean;
}

export const REVIEW_PALETTE_COMMANDS = [
  { id: APP_COMMAND_IDS.startStudyMode, title: 'Enter Review Mode', section: 'Review' },
  { id: APP_COMMAND_IDS.revealReviewAnswer, title: 'Reveal Review Answer', section: 'Review' },
  { id: APP_COMMAND_IDS.gradeReviewAgain, title: 'Grade Review: Again', section: 'Review', keywords: ['grade'] },
  { id: APP_COMMAND_IDS.gradeReviewHard, title: 'Grade Review: Hard', section: 'Review', keywords: ['grade'] },
  { id: APP_COMMAND_IDS.gradeReviewGood, title: 'Grade Review: Good', section: 'Review', keywords: ['grade'] },
  { id: APP_COMMAND_IDS.gradeReviewEasy, title: 'Grade Review: Easy', section: 'Review', keywords: ['grade'] },
  { id: APP_COMMAND_IDS.readingReviewLater, title: 'Reading: Later', section: 'Review', keywords: ['reading'] },
  { id: APP_COMMAND_IDS.readingReviewRead, title: 'Reading: Read', section: 'Review', keywords: ['reading'] },
  { id: APP_COMMAND_IDS.readingReviewDismiss, title: 'Reading: Dismiss', section: 'Review', keywords: ['reading'] },
  { id: APP_COMMAND_IDS.deleteCurrentReviewItem, title: 'Delete Current Review Item', section: 'Review', keywords: ['delete', 'trash'] }
];

function isReviewGradeCommand(id: string) {
  return (
    id === APP_COMMAND_IDS.gradeReviewAgain ||
    id === APP_COMMAND_IDS.gradeReviewHard ||
    id === APP_COMMAND_IDS.gradeReviewGood ||
    id === APP_COMMAND_IDS.gradeReviewEasy
  );
}

export function isReviewCommandEnabled(id: string, options: ReviewPaletteCommandOptions) {
  if (id === APP_COMMAND_IDS.startStudyMode) return options.canToggleReviewMode;
  if (id === APP_COMMAND_IDS.revealReviewAnswer) return options.canRevealAnswer;
  if (id === APP_COMMAND_IDS.readingReviewLater) return options.canDeferReadingReview;
  if (id === APP_COMMAND_IDS.readingReviewRead) return options.canCompleteReadingReview;
  if (id === APP_COMMAND_IDS.readingReviewDismiss) return options.canDismissReadingReview;
  if (id === APP_COMMAND_IDS.deleteCurrentReviewItem) return options.canDeleteReviewItem;
  if (isReviewGradeCommand(id)) return options.canGradeReview;
  return null;
}
