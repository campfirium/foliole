import { Fragment, useRef, useState } from 'react';

import { useBreadcrumbFit } from '../shared/lib/useBreadcrumbFit';
import { useTranslation } from '../shared/localization/LocalizationProvider';

import { CompanionMenuRow, CompanionMenuSheet } from './CompanionMenuSheet';
import type { CompanionReviewBreadcrumbItem } from './companionReviewBreadcrumbs';

const segmentClassName = 'inline-flex min-h-9 shrink-0 items-center rounded-sm border-0 bg-transparent px-1 text-[12px] leading-5 text-companion-text-secondary hover:text-foreground';

function Separator() {
  return <span aria-hidden="true" className="shrink-0 px-1 text-companion-text-tertiary">/</span>;
}

export function ReviewBreadcrumb(props: { items: CompanionReviewBreadcrumbItem[]; onSelectItem?: (id: string) => void }) {
  const t = useTranslation();
  const lineRef = useRef<HTMLDivElement>(null);
  const [pathOpen, setPathOpen] = useState(false);
  const shown = useBreadcrumbFit(lineRef, props.items.length, props.items.map(item => item.id).join('/'));
  if (props.items.length === 0) {
    return null;
  }
  const visible = props.items.slice(props.items.length - shown);
  const hasHidden = shown < props.items.length;

  return (
    <nav aria-label={t('companion.review.breadcrumb')}>
      <div ref={lineRef} className="flex min-w-0 items-center overflow-hidden whitespace-nowrap text-[12px] leading-5 text-companion-text-secondary">
        {hasHidden ? (
          <>
            <button aria-label={t('shared.breadcrumb.expand')} className={segmentClassName} onClick={() => setPathOpen(true)} type="button">…</button>
            <Separator />
          </>
        ) : null}
        {visible.map((item, index) => (
          <Fragment key={item.id}>
            <button className={segmentClassName} onClick={() => props.onSelectItem?.(item.targetNodeId)} title={item.title} type="button">
              {item.label}
            </button>
            {index < visible.length - 1 ? <Separator /> : null}
          </Fragment>
        ))}
      </div>
      {hasHidden ? (
        <CompanionMenuSheet open={pathOpen} onOpenChange={setPathOpen} title={t('shared.breadcrumb.location')}>
          {props.items.map(item => (
            <CompanionMenuRow key={item.id} label={item.title} onSelect={() => { setPathOpen(false); props.onSelectItem?.(item.targetNodeId); }} />
          ))}
        </CompanionMenuSheet>
      ) : null}
    </nav>
  );
}
