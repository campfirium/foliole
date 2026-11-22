import { Fragment, useRef } from 'react';

import { useBreadcrumbFit } from '../lib/useBreadcrumbFit';
import { useTranslation } from '../localization/LocalizationProvider';

import { AppDropdownMenu, AppDropdownMenuContent, AppDropdownMenuItem, AppDropdownMenuTrigger } from './DropdownMenu';

import { cn } from '@/shared/lib/utils';

export interface AppBreadcrumbItem {
  id: string;
  /** Short level label shown on the line. */
  label: string;
  /** Full title, shown in the path menu and as the tooltip. */
  title?: string;
}

interface BreadcrumbProps {
  ariaLabel?: string;
  className?: string;
  /** Ancestors, farthest first. */
  items: AppBreadcrumbItem[];
  onSelect: (id: string) => void;
}

const segmentClassName = 'inline-block shrink-0 border-0 bg-transparent p-0 text-left align-baseline text-ui-md font-normal leading-[1.25] text-foreground/45 hover:text-foreground/65';

function Separator() {
  return (
    <span aria-hidden="true" className="inline-flex shrink-0 select-none items-center px-1 text-ui-md font-normal leading-[1.25] text-foreground/30">
      <span className="relative top-[-0.5px]">/</span>
    </span>
  );
}

/** One line of ancestors; levels that do not fit collapse into a leading "…" that lists the whole path. */
export function AppBreadcrumb({ ariaLabel, className, items, onSelect }: BreadcrumbProps) {
  const t = useTranslation();
  const lineRef = useRef<HTMLElement>(null);
  const shown = useBreadcrumbFit(lineRef, items.length, items.map(item => item.id).join('/'));
  const visible = items.slice(items.length - shown);
  const hasHidden = shown < items.length;

  return (
    <nav ref={lineRef} aria-label={ariaLabel ?? t('shared.breadcrumb.aria')} className={cn('flex min-w-0 items-baseline overflow-hidden whitespace-nowrap', className)}>
      {hasHidden ? (
        <>
          <AppDropdownMenu>
            <AppDropdownMenuTrigger asChild>
              <button aria-label={t('shared.breadcrumb.expand')} className={segmentClassName} type="button">…</button>
            </AppDropdownMenuTrigger>
            <AppDropdownMenuContent align="start" sideOffset={6}>
              {items.map(item => (
                <AppDropdownMenuItem key={item.id} onSelect={() => onSelect(item.id)}>{item.title ?? item.label}</AppDropdownMenuItem>
              ))}
            </AppDropdownMenuContent>
          </AppDropdownMenu>
          <Separator />
        </>
      ) : null}
      {visible.map((item, index) => (
        <Fragment key={item.id}>
          <button className={segmentClassName} onClick={() => onSelect(item.id)} title={item.title} type="button">{item.label}</button>
          {index < visible.length - 1 ? <Separator /> : null}
        </Fragment>
      ))}
    </nav>
  );
}
