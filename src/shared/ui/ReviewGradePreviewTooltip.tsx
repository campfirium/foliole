import type { ReactNode } from 'react';

import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from './Tooltip';

export function formatReviewGradePreviewDue(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short'
  }).format(date);
}

export function ReviewGradePreviewTooltip({ children, dueLabel }: { children: ReactNode; dueLabel?: string | undefined }) {
  if (!dueLabel) return children;
  return (
    <AppTooltip>
      <AppTooltipTrigger asChild>{children}</AppTooltipTrigger>
      <AppTooltipContent align="center" arrow side="top" sideOffset={8}>
        {dueLabel}
      </AppTooltipContent>
    </AppTooltip>
  );
}
