import { APP_COMMAND_IDS } from '../../shared/commands/ids';

export interface ReviewPaletteCommandOptions {
  canRevealAnswer: boolean;
  canToggleReviewMode: boolean;
  canGradeReview: boolean;
  canSoonReadingReview: boolean;
  canPostponeReviewTopic: boolean;
  canDelayReviewTopic?: boolean;
  canReadReviewTopic: boolean;
  canDismissReadingReview: boolean;
  canScrollReviewReading?: boolean;
  canDeleteReviewItem: boolean;
  canDeleteReviewSourceTopic?: boolean;
  canReviewNavigateBack?: boolean;
  canReviewNavigateDown?: boolean;
  canReviewNavigateForward?: boolean;
  canReviewNavigateNextSibling?: boolean;
  canReviewNavigateParent?: boolean;
  canReviewNavigatePreviousSibling?: boolean;
}

export const REVIEW_PALETTE_COMMANDS = [
  { id: APP_COMMAND_IDS.startStudyMode, title: 'Toggle Flow Mode', section: 'Flow', keywords: ['flow', 'review', 'reading'] },
  { id: APP_COMMAND_IDS.revealReviewAnswer, title: 'Reveal Review Answer', section: 'Review' },
  { id: APP_COMMAND_IDS.gradeReviewAgain, title: 'Grade Review: Again', section: 'Review', keywords: ['grade'] },
  { id: APP_COMMAND_IDS.gradeReviewHard, title: 'Grade Review: Hard', section: 'Review', keywords: ['grade'] },
  { id: APP_COMMAND_IDS.gradeReviewGood, title: 'Grade Review: Good', section: 'Review', keywords: ['grade'] },
  { id: APP_COMMAND_IDS.gradeReviewEasy, title: 'Grade Review: Easy', section: 'Review', keywords: ['grade'] },
  { id: APP_COMMAND_IDS.readingReviewSoon, title: 'Reading: Soon', section: 'Review', keywords: ['reading'] },
  { id: APP_COMMAND_IDS.readingReviewLater, title: 'Reading: Later', section: 'Review', keywords: ['reading'] },
  { id: APP_COMMAND_IDS.readingReviewPostpone, title: 'Postpone Topic...', section: 'Review', keywords: ['reading', 'topic', 'delay'] },
  { id: APP_COMMAND_IDS.readingReviewRead, title: 'Reading: Read', section: 'Review', keywords: ['reading'] },
  { id: APP_COMMAND_IDS.readingReviewDismiss, title: 'Reading: Dismiss', section: 'Review', keywords: ['reading'] },
  { id: APP_COMMAND_IDS.reviewScrollReadingDown, title: 'Scroll Reading Down', section: 'Review', keywords: ['reading', 'scroll'] },
  { id: APP_COMMAND_IDS.reviewScrollReadingUp, title: 'Scroll Reading Up', section: 'Review', keywords: ['reading', 'scroll'] },
  { id: APP_COMMAND_IDS.deleteCurrentReviewItem, title: 'Delete Current Review Item', section: 'Review', keywords: ['delete', 'trash'] },
  { id: APP_COMMAND_IDS.reviewNavigateParent, title: 'Review Navigation: Parent', section: 'Review', keywords: ['navigate'] },
  { id: APP_COMMAND_IDS.reviewNavigateBack, title: 'Review Navigation: Back', section: 'Review', keywords: ['navigate'] },
  { id: APP_COMMAND_IDS.reviewNavigateForward, title: 'Review Navigation: Forward', section: 'Review', keywords: ['navigate'] },
  { id: APP_COMMAND_IDS.reviewNavigateDown, title: 'Review Navigation: Down', section: 'Review', keywords: ['navigate'] },
  { id: APP_COMMAND_IDS.reviewNavigatePreviousSibling, title: 'Review Navigation: Previous Sibling', section: 'Review', keywords: ['navigate'] },
  { id: APP_COMMAND_IDS.reviewNavigateNextSibling, title: 'Review Navigation: Next Sibling', section: 'Review', keywords: ['navigate'] },
  { id: APP_COMMAND_IDS.deleteReviewSourceTopic, title: 'Delete Review Source Topic', section: 'Review', keywords: ['delete', 'trash', 'source'] }
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
  if (id === APP_COMMAND_IDS.readingReviewSoon) return options.canSoonReadingReview;
  if (id === APP_COMMAND_IDS.readingReviewLater) return options.canPostponeReviewTopic;
  if (id === APP_COMMAND_IDS.readingReviewPostpone) return options.canDelayReviewTopic ?? false;
  if (id === APP_COMMAND_IDS.readingReviewRead) return options.canReadReviewTopic;
  if (id === APP_COMMAND_IDS.readingReviewDismiss) return options.canDismissReadingReview;
  if (id === APP_COMMAND_IDS.reviewScrollReadingDown || id === APP_COMMAND_IDS.reviewScrollReadingUp) return options.canScrollReviewReading ?? false;
  if (id === APP_COMMAND_IDS.deleteCurrentReviewItem) return options.canDeleteReviewItem;
  if (id === APP_COMMAND_IDS.reviewNavigateParent) return options.canReviewNavigateParent ?? false;
  if (id === APP_COMMAND_IDS.reviewNavigateBack) return options.canReviewNavigateBack ?? false;
  if (id === APP_COMMAND_IDS.reviewNavigateForward) return options.canReviewNavigateForward ?? false;
  if (id === APP_COMMAND_IDS.reviewNavigateDown) return options.canReviewNavigateDown ?? false;
  if (id === APP_COMMAND_IDS.reviewNavigatePreviousSibling) return options.canReviewNavigatePreviousSibling ?? false;
  if (id === APP_COMMAND_IDS.reviewNavigateNextSibling) return options.canReviewNavigateNextSibling ?? false;
  if (id === APP_COMMAND_IDS.deleteReviewSourceTopic) return options.canDeleteReviewSourceTopic ?? false;
  if (isReviewGradeCommand(id)) return options.canGradeReview;
  return null;
}
