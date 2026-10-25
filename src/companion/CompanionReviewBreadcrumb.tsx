import { Fragment } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';

import type { CompanionReviewBreadcrumbItem } from './companionReviewBreadcrumbs';

export function ReviewBreadcrumb(props: { items: CompanionReviewBreadcrumbItem[]; onSelectItem?: (id: string) => void }) {
  const t = useTranslation();
  if (props.items.length === 0) {
    return null;
  }

  return (
    <nav aria-label={t('companion.review.breadcrumb')}>
      <div className="overflow-x-auto whitespace-nowrap text-[12px] leading-5 text-companion-text-secondary">
        {props.items.map((item, index) => (
          <Fragment key={item.id}>
            <button
              aria-current={item.isCurrent ? 'page' : undefined}
              className="inline-block max-w-[18ch] min-h-9 truncate align-middle rounded-sm border-0 bg-transparent px-1 text-left text-[12px] leading-5 text-companion-text-secondary hover:text-foreground aria-[current=page]:cursor-default"
              onClick={() => props.onSelectItem?.(item.targetNodeId)}
              title={item.label}
              type="button"
            >
              {item.label}
            </button>
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
