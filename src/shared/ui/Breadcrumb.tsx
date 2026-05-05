import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface AppBreadcrumbItem {
  id: string;
  label: ReactNode;
  isCurrent?: boolean;
  isEllipsis?: boolean;
}

interface BreadcrumbProps {
  ariaLabel?: string;
  className?: string;
  items: AppBreadcrumbItem[];
  onSelect: (id: string) => void;
  onExpandEllipsis?: (id: string) => void;
}

export function Breadcrumb({
  ariaLabel = 'Breadcrumb',
  className,
  items,
  onSelect,
  onExpandEllipsis
}: BreadcrumbProps) {
  return (
    <nav aria-label={ariaLabel} className={cn('block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap', className)}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        const isCurrent = Boolean(item.isCurrent || isLast);

        if (item.isEllipsis) {
          return (
            <button
              aria-label="Expand breadcrumb path"
              className="inline-block max-w-none border-0 bg-transparent p-0 text-xs font-medium leading-none text-slate-500"
              key={item.id}
              onClick={() => onExpandEllipsis?.(item.id)}
              type="button"
            >
              {item.label}
            </button>
          );
        }

        return (
          <span className="inline" key={item.id}>
            <button
              aria-current={isCurrent ? 'page' : undefined}
              className="inline-block max-w-[18ch] overflow-hidden border-0 bg-transparent p-0 text-left align-bottom text-xs font-medium leading-none text-slate-500 text-ellipsis hover:text-foreground aria-[current=page]:max-w-[24ch] aria-[current=page]:cursor-default aria-[current=page]:text-foreground"
              onClick={() => onSelect(item.id)}
              type="button"
            >
              {item.label}
            </button>
            {!isLast ? (
              <span aria-hidden="true" className="px-1 text-xs font-medium leading-none text-slate-500">
                {' / '}
              </span>
            ) : null}
          </span>
        );
      })}
    </nav>
  );
}
