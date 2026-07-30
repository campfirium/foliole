import * as React from 'react';

import { appInputFocusVisibleClassName } from './InputFocus';

import { cn } from '@/shared/lib/utils';

type AppTextareaProps = React.ComponentProps<'textarea'>;

export const AppTextarea = React.forwardRef<HTMLTextAreaElement, AppTextareaProps>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex min-h-32 w-full resize-y rounded-md border border-settings-control-border bg-settings-control px-3 py-2 text-ui-input text-foreground transition-colors placeholder:text-foreground/45 hover:border-settings-control-border-hover hover:bg-settings-control-hover focus-visible:border-settings-control-border-hover disabled:cursor-not-allowed disabled:opacity-45',
      appInputFocusVisibleClassName,
      className
    )}
    {...props}
  />
));
AppTextarea.displayName = 'AppTextarea';
