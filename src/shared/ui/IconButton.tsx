import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { Button as ShadcnButton } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: ReactNode;
  label: string;
}

export function IconButton({ icon, label, className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <ShadcnButton aria-label={label} className={cn('size-8', className)} size="icon" type={type} variant="ghost" {...rest}>
      {icon}
    </ShadcnButton>
  );
}
