import * as React from 'react';

import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(({ className, type, ...props }, ref) => {
  return (
    <input
      className={cn(
        'flex h-9 w-full rounded-md border border-border bg-bg-elevated px-3 py-1 text-sm text-foreground ring-offset-background placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong disabled:cursor-not-allowed disabled:opacity-45',
        className
      )}
      ref={ref}
      type={type}
      {...props}
    />
  );
});
Input.displayName = 'Input';

export { Input };
