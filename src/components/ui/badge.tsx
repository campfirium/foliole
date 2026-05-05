import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex min-h-6 items-center rounded-full border px-2 text-xs font-semibold', {
  variants: {
    variant: {
      default: 'border-transparent bg-accent text-accent-foreground',
      secondary: 'border-border bg-slate-100 text-slate-700',
      destructive: 'border-red-200 bg-red-50 text-red-600',
      outline: 'border-border text-slate-700'
    }
  },
  defaultVariants: {
    variant: 'default'
  }
});

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
