import { Fragment, useLayoutEffect, useRef } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';

import type { CompanionReviewBreadcrumbItem } from './companionReviewBreadcrumbs';

const itemClassName = 'inline-block min-h-9 truncate align-middle rounded-sm border-0 bg-transparent px-1 text-left text-[12px] leading-5 text-companion-text-secondary';

export function ReviewBreadcrumb(props: { items: CompanionReviewBreadcrumbItem[]; onSelectItem?: (id: string) => void }) {
  const t = useTranslation();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pathKey = props.items.map(item => item.id).join('/');
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollLeft = scroller.scrollWidth;
  }, [pathKey]);
  if (props.items.length === 0) {
    return null;
  }

  return (
    <nav aria-label={t('companion.review.breadcrumb')}>
      <div ref={scrollerRef} className="overflow-x-auto whitespace-nowrap text-[12px] leading-5 text-companion-text-secondary">
        {props.items.map((item, index) => (
          <Fragment key={item.id}>
            {item.isCurrent ? (
              <span aria-current="page" className={`${itemClassName} max-w-[24ch] leading-9 text-foreground`} title={item.label}>
                {item.label}
              </span>
            ) : (
              <button
                className={`${itemClassName} max-w-[18ch] hover:text-foreground`}
                onClick={() => props.onSelectItem?.(item.targetNodeId)}
                title={item.label}
                type="button"
              >
                {item.label}
              </button>
            )}
            {index < props.items.length - 1 ? (
              <span aria-hidden="true" className="px-1 text-companion-text-tertiary">
                /
              </span>
            ) : null}
          </Fragment>
        ))}
      </div>
    </nav>
  );
}
