import * as React from 'react';

import { cn } from '@/lib/utils';

type AppInputProps = React.ComponentProps<'input'>;

export const AppInput = React.forwardRef<HTMLInputElement, AppInputProps>(({ className, type, ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      'flex h-10 w-full border border-border bg-bg-elevated px-3 py-1 text-base text-foreground ring-offset-background placeholder:text-foreground/45 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-strong disabled:cursor-not-allowed disabled:opacity-45',
      className
    )}
    {...props}
  />
));
AppInput.displayName = 'AppInput';
