import type { ReactNode } from 'react';

export type ReviewActionButtonPresentation = {
  label: string;
  icon?: ReactNode;
  disabled: boolean;
  onClick(): void;
  testId?: string | undefined;
  title?: string | undefined;
};

export type RenderReviewActionButton = (props: ReviewActionButtonPresentation) => ReactNode;
