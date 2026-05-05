import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        default: 'bg-accent text-accent-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] hover:bg-accent-strong',
        destructive: 'bg-red-500 text-white hover:bg-red-600',
        outline: 'border border-border bg-bg-panel text-foreground hover:bg-amber-100/50',
        secondary: 'bg-amber-100 text-amber-900 hover:bg-amber-200',
        ghost: 'text-foreground hover:bg-amber-100/60',
        link: 'text-accent-strong underline-offset-4 hover:underline'
      },
      size: {
        default: 'h-9 px-4',
        sm: 'h-8 px-3',
        lg: 'h-10 px-8',
        icon: 'size-8'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
