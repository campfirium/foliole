import * as React from 'react';

import { appInputFocusVisibleClassName } from './InputFocus';

import { cn } from '@/shared/lib/utils';

type AppInputProps = React.ComponentProps<'input'>;

export const AppInput = React.forwardRef<HTMLInputElement, AppInputProps>(({ className, type, ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      'flex h-10 w-full appearance-none rounded-md border border-settings-control-border bg-settings-control px-3 py-1 text-base text-foreground transition-colors placeholder:text-foreground/45 hover:border-settings-control-border-hover hover:bg-settings-control-hover focus-visible:border-settings-control-border-hover disabled:cursor-not-allowed disabled:opacity-45',
      appInputFocusVisibleClassName,
      className
    )}
    {...props}
  />
));
AppInput.displayName = 'AppInput';
