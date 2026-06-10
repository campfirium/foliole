import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';

const inspectorListClassName = 'flex min-w-0 flex-col';
export const inspectorListDividerClassName = 'border-b border-border/40 last:border-b-0';
export const inspectorListDividerLineClassName = 'bg-border/40';
export const inspectorListTopDividerClassName = 'border-t border-border/40 first:border-t-0';
export const inspectorListHeadingClassName = 'px-1 pb-2 text-ui-sm font-medium uppercase tracking-wide text-foreground/55';
export const inspectorListMetaClassName = 'text-ui-sm leading-5 text-foreground/52';
export const inspectorListTitleClassName = 'min-w-0 text-ui-md font-medium leading-5 text-foreground/88';
export const inspectorListBodyClassName = 'min-w-0 text-ui-md leading-6 text-foreground/68';
export const inspectorDefinitionListClassName = 'grid grid-cols-[minmax(112px,1fr)_max-content] gap-x-4 gap-y-2.5 px-3 text-ui-md';
export const inspectorDefinitionTermClassName = 'text-foreground/55';
export const inspectorDefinitionValueClassName = 'min-w-[4.75rem] whitespace-nowrap text-right tabular-nums text-foreground/84';

interface InspectorListProps {
  ariaLabel?: string;
  children: ReactNode;
  className?: string;
}

interface InspectorListHeadingProps {
  children: ReactNode;
  className?: string;
}

interface InspectorListRowProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  active?: boolean;
  children: ReactNode;
}

export function InspectorList({ ariaLabel, children, className }: InspectorListProps) {
  return (
    <ol aria-label={ariaLabel} className={cn(inspectorListClassName, className)}>
      {children}
    </ol>
  );
}

export function InspectorListHeading({ children, className }: InspectorListHeadingProps) {
  return <p className={cn(inspectorListHeadingClassName, className)}>{children}</p>;
}

export const InspectorListRow = forwardRef<HTMLButtonElement, InspectorListRowProps>(function InspectorListRow(
  { active = false, children, className, type = 'button', ...buttonProps },
  ref
) {
  return (
    <button
      className={cn(
        'flex min-w-0 w-full text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        'hover:bg-[color-mix(in_srgb,var(--app-surface)_96%,rgb(var(--color-foreground))_4%)] focus-visible:bg-[color-mix(in_srgb,var(--app-surface)_96%,rgb(var(--color-foreground))_4%)]',
        active && 'bg-[color-mix(in_srgb,var(--app-surface)_82%,rgb(var(--app-accent-color-rgb))_18%)] shadow-[inset_0_0_0_1px_rgb(var(--app-accent-color-rgb)/0.1)]',
        className
      )}
      ref={ref}
      type={type}
      {...buttonProps}
    >
      {children}
    </button>
  );
});
