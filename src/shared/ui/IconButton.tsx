import { IconButton as RadixIconButton } from '@radix-ui/themes';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'color'> {
  icon: ReactNode;
  label: string;
}

export function AppIconButton({ icon, label, className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <RadixIconButton aria-label={label} className={cn('size-8', className)} size="1" type={type} variant="ghost" {...rest}>
      {icon}
    </RadixIconButton>
  );
}
