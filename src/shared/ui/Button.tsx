import { Button as RadixButton } from '@radix-ui/themes';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'ghost' | 'subtle' | 'list';
type ButtonSize = 'sm' | 'md';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color'> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  active?: boolean;
}

function resolveVariant(variant: ButtonVariant) {
  if (variant === 'primary') {
    return 'ghost';
  }
  if (variant === 'ghost') {
    return 'outline';
  }
  return 'ghost';
}

function resolveSize(size: ButtonSize) {
  return size === 'sm' ? '1' : '2';
}

export function AppButton({
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
    <RadixButton
      className={cn(
        isList && 'w-full justify-start px-3 py-2 text-left text-[13px]',
        variant === 'primary' && 'border border-border bg-transparent text-foreground hover:bg-foreground/[0.04]',
        variant === 'subtle' && 'text-foreground/70 hover:text-foreground',
        active && isList && 'border border-border-strong bg-foreground/[0.05] text-foreground',
        className
      )}
      data-active={active}
      size={isList ? undefined : resolveSize(size)}
      type={type}
      variant={resolveVariant(variant)}
      {...rest}
    >
      {children}
    </RadixButton>
  );
}
