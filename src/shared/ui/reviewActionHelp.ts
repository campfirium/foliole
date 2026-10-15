import type { ActionHelpCardCopy } from './ActionHelpCard';

export interface ReviewActionHelpCopy extends ActionHelpCardCopy {
  id: `actionHelp.review.${string}`;
  keywords?: string[];
  sourceLabel: string;
}

export const REVIEW_GRADE_ACTION_HELP = {
  again: {
    body: 'Show this item again soon.',
    detail: 'You could not recall the answer.',
    id: 'actionHelp.review.again',
    keywords: ['forgot', 'missed', 'review'],
    sourceLabel: 'Flow action bar',
    title: 'Again'
  },
  hard: {
    body: 'Show this item again sooner than usual.',
    detail: 'You recalled the answer, but only with effort.',
    id: 'actionHelp.review.hard',
    keywords: ['difficult', 'effort', 'review'],
    sourceLabel: 'Flow action bar',
    title: 'Hard'
  },
  good: {
    body: 'Keep this item on its normal review path.',
    detail: 'You recalled the answer.',
    id: 'actionHelp.review.good',
    keywords: ['remembered', 'review'],
    sourceLabel: 'Flow action bar',
    title: 'Good'
  },
  easy: {
    body: 'Wait longer before showing this item again.',
    detail: 'The answer felt obvious.',
    id: 'actionHelp.review.easy',
    keywords: ['obvious', 'review'],
    sourceLabel: 'Flow action bar',
    title: 'Easy'
  }
} satisfies Record<string, ReviewActionHelpCopy>;

export const READING_REVIEW_ACTION_HELP = {
  soon: {
    body: 'Appears again after this queue.',
    detail: 'Skip it for now and read it after this queue.',
    id: 'actionHelp.review.soon',
    keywords: ['soon', 'queue', 'topic'],
    sourceLabel: 'Flow action bar',
    title: 'Soon'
  },
  later: {
    body: 'Appears again before its regular interval.',
    detail: 'Skip it for now and read it after a shorter interval.',
    id: 'actionHelp.review.later',
    keywords: ['later', 'topic'],
    sourceLabel: 'Flow action bar',
    title: 'Later'
  },
  read: {
    body: 'Appears again after its regular interval.',
    detail: 'You have read part of it and want to continue after the regular interval.',
    id: 'actionHelp.review.read',
    keywords: ['read', 'topic'],
    sourceLabel: 'Flow action bar',
    title: 'Read'
  },
  dismiss: {
    body: 'No longer appears automatically.',
    detail: 'You can still open it manually when needed.',
    id: 'actionHelp.review.dismiss',
    keywords: ['dismiss', 'topic'],
    sourceLabel: 'Flow action bar',
    title: 'Dismiss'
  }
} satisfies Record<string, ReviewActionHelpCopy>;

export const REVIEW_ACTION_HELP = {
  ...REVIEW_GRADE_ACTION_HELP,
  ...READING_REVIEW_ACTION_HELP
} satisfies Record<string, ReviewActionHelpCopy>;
