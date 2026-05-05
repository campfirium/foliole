import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';

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

export function AppBreadcrumb({
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
        const isCurrent = Boolean(item.isCurrent);

        if (item.isEllipsis) {
          return (
            <button
              aria-label="Expand breadcrumb path"
              className="inline-block max-w-none border-0 bg-transparent p-0 text-sm font-normal leading-[1.25] text-[#7f8791] hover:text-[#5f6368]"
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
              className="inline-block max-w-[18ch] overflow-hidden border-0 bg-transparent p-0 text-left align-baseline text-sm font-normal leading-[1.25] text-[#7f8791] text-ellipsis hover:text-[#5f6368] aria-[current=page]:max-w-[24ch] aria-[current=page]:cursor-default aria-[current=page]:font-normal aria-[current=page]:text-[#7f8791]"
              onClick={() => onSelect(item.id)}
              type="button"
            >
              {item.label}
            </button>
            {!isLast ? (
              <span aria-hidden="true" className="inline-flex select-none items-center px-1 text-sm font-normal leading-[1.25] text-[#a4aab1]">
                <span className="relative top-[-0.5px]">/</span>
              </span>
            ) : null}
          </span>
        );
      })}
    </nav>
  );
}
