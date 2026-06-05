import type { ActionHelpCardCopy } from './ActionHelpCard';

export interface ReviewActionHelpCopy extends ActionHelpCardCopy {
  id: `actionHelp.review.${string}`;
  keywords?: string[];
  sourceLabel: string;
}

export const REVIEW_GRADE_ACTION_HELP = {
  again: {
    body: 'Show this item again soon.',
    detail: 'Use this when you could not recall the answer.',
    id: 'actionHelp.review.again',
    keywords: ['forgot', 'missed', 'review'],
    sourceLabel: 'Flow action bar',
    title: 'Again'
  },
  hard: {
    body: 'Show this item again sooner than usual.',
    detail: 'Use this when you remembered the answer, but only with effort.',
    id: 'actionHelp.review.hard',
    keywords: ['difficult', 'effort', 'review'],
    sourceLabel: 'Flow action bar',
    title: 'Hard'
  },
  good: {
    body: 'Keep this item on its normal review path.',
    detail: 'Use this when you remembered the answer.',
    id: 'actionHelp.review.good',
    keywords: ['remembered', 'review'],
    sourceLabel: 'Flow action bar',
    title: 'Good'
  },
  easy: {
    body: 'Wait longer before showing this item again.',
    detail: 'Use this when the answer felt obvious.',
    id: 'actionHelp.review.easy',
    keywords: ['obvious', 'review'],
    sourceLabel: 'Flow action bar',
    title: 'Easy'
  }
} satisfies Record<string, ReviewActionHelpCopy>;

export const READING_REVIEW_ACTION_HELP = {
  soon: {
    body: 'Appears again after this queue.',
    detail: 'Use this when you are not reading it now and want to read it after the queue.',
    id: 'actionHelp.review.soon',
    keywords: ['soon', 'queue', 'topic'],
    sourceLabel: 'Flow action bar',
    title: 'Soon'
  },
  later: {
    body: 'Appears again before its regular interval.',
    detail: 'Use this when you are not reading it now and want to read it after a shorter interval.',
    id: 'actionHelp.review.later',
    keywords: ['later', 'topic'],
    sourceLabel: 'Flow action bar',
    title: 'Later'
  },
  read: {
    body: 'Appears again after its regular interval.',
    detail: 'Use this after reading part of it when you want to continue after the regular interval.',
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
