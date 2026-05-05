import { Leaf } from 'lucide-react';

import { cn } from '../../../shared/lib/utils';

interface NodeTreeRowIconProps {
  isDerived: boolean;
  isReviewCard: boolean;
}

export function NodeTreeRowIcon({ isDerived, isReviewCard }: NodeTreeRowIconProps) {
  return (
    <Leaf
      aria-hidden="true"
      className={cn(
        'mr-1 size-3.5 flex-none text-foreground/65',
        isReviewCard && '[transform:scaleX(-1)]',
        isDerived && 'text-foreground/45'
      )}
      data-node-icon="leaf"
      data-node-icon-variant={isReviewCard ? 'review' : 'default'}
      strokeWidth={1.75}
    />
  );
}
