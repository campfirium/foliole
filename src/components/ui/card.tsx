import * as React from 'react';

import { cn } from '@/lib/utils';

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-white to-bg-subtle text-foreground shadow-[0_0_0_1px_rgba(148,163,184,0.14),0_16px_28px_-20px_rgba(15,23,42,0.24)]', className)}
    {...props}
  />
));
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex min-h-[52px] items-center justify-between gap-3 border-b border-dashed border-border px-4 py-3', className)} {...props} />
));
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(({ className, ...props }, ref) => (
  <h3 ref={ref} className={cn('m-0 text-xs font-bold uppercase tracking-[0.05em]', className)} {...props} />
));
CardTitle.displayName = 'CardTitle';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex-1 p-3', className)} {...props} />
));
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('border-t border-dashed border-border p-3', className)} {...props} />
));
CardFooter.displayName = 'CardFooter';

export { Card, CardContent, CardFooter, CardHeader, CardTitle };
