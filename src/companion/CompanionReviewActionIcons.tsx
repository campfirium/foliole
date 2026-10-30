import { Archive, BookOpen, Check, ChevronsRight, Hourglass, RotateCcw, Clock3, ClockArrowUp } from 'lucide-react';

const iconProps = { 'aria-hidden': true, size: 20, strokeWidth: 1.75 } as const;

// Sparse, distinct silhouettes use the same size and stroke as bottom navigation.
export const companionGradeIcons = {
  1: <RotateCcw {...iconProps} />,
  2: <Hourglass {...iconProps} />,
  3: <Check {...iconProps} />,
  4: <ChevronsRight {...iconProps} />
};

export const companionReadingIcons = {
  soon: <Clock3 {...iconProps} />,
  later: <ClockArrowUp {...iconProps} />,
  read: <BookOpen {...iconProps} />,
  dismiss: <Archive {...iconProps} />
};
