import { BookOpenText, ListChecks, Route } from 'lucide-react';

export const reviewSessionModeOptions = [
  { id: 'recommended', Icon: Route, labelKey: 'desktop.reviewSession.mode.recommended' },
  { id: 'review-first', Icon: ListChecks, labelKey: 'desktop.reviewSession.mode.reviewFirst' },
  { id: 'reading-only', Icon: BookOpenText, labelKey: 'desktop.reviewSession.mode.readingOnly' }
] as const;
