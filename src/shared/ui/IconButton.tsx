import { IconButton as RadixIconButton } from '@radix-ui/themes';
import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'color'> {
  icon: ReactNode;
  label: string;
}

export const AppIconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function AppIconButton(
  { icon, label, className, type = 'button', ...rest },
  ref
) {
  return (
    <RadixIconButton
      aria-label={label}
      className={cn('size-8', className)}
      ref={ref}
      size="1"
      type={type}
      variant="ghost"
      {...rest}
    >
      {icon}
    </RadixIconButton>
  );
});
