import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { Button as ShadcnButton } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'ghost' | 'subtle' | 'list';
type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  active?: boolean;
}

function resolveVariant(variant: ButtonVariant) {
  if (variant === 'primary') {
    return 'default';
  }
  if (variant === 'ghost') {
    return 'outline';
  }
  return 'ghost';
}

function resolveSize(size: ButtonSize) {
  return size === 'sm' ? 'sm' : 'default';
}

export function Button({
  children,
  variant = 'ghost',
  size = 'sm',
  className,
  active = false,
  type = 'button',
  ...rest
}: ButtonProps) {
  const isList = variant === 'list';

  return (
    <ShadcnButton
      className={cn(
        isList && 'w-full justify-start px-3 py-2 text-left text-[13px]',
        variant === 'subtle' && 'text-stone-600 hover:text-stone-800',
        active && isList && 'border border-border-strong bg-amber-100/70 text-foreground',
        className
      )}
      data-active={active}
      size={isList ? undefined : resolveSize(size)}
      type={type}
      variant={resolveVariant(variant)}
      {...rest}
    >
      {children}
    </ShadcnButton>
  );
}
