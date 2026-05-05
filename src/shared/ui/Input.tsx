import * as React from 'react';

import { cn } from '@/lib/utils';

type AppInputProps = React.ComponentProps<'input'>;

export const AppInput = React.forwardRef<HTMLInputElement, AppInputProps>(({ className, type, ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      'flex h-9 w-full rounded-md border border-border bg-bg-elevated px-3 py-1 text-sm text-foreground ring-offset-background placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong disabled:cursor-not-allowed disabled:opacity-45',
      className
    )}
    {...props}
  />
));
AppInput.displayName = 'AppInput';
