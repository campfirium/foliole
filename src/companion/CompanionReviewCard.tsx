import { Fragment } from 'react';

import { definedProps } from '../shared/lib/definedProps';
import { useTranslation } from '../shared/localization/LocalizationProvider';

import { CompanionArticleDocument } from './CompanionArticleDocument';
import type { CompanionReviewBreadcrumbItem } from './companionReviewBreadcrumbs';
import type { CompanionReviewCard as CompanionReviewCardModel } from './companionReviewSession';

function ReviewBreadcrumb(props: { items: CompanionReviewBreadcrumbItem[]; onSelectItem?: (id: string) => void }) {
  const t = useTranslation();
  if (props.items.length === 0) {
    return null;
  }

  return (
    <nav aria-label={t('companion.review.breadcrumb')} className="mb-2 px-6">
      <div className="line-clamp-1 text-[12px] leading-5 text-companion-text-secondary">
        {props.items.map((item, index) => (
          <Fragment key={item.id}>
            <button
              aria-current={item.isCurrent ? 'page' : undefined}
              className="inline rounded-sm border-0 bg-transparent p-0 text-left text-[12px] leading-5 text-companion-text-secondary hover:text-foreground aria-[current=page]:cursor-default"
              onClick={() => props.onSelectItem?.(item.targetNodeId)}
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

function ReviewAnswer(props: { nodeId: string; reveal: string }) {
  const t = useTranslation();
  return (
    <section className="mt-5">
      <div className="mx-6 flex items-center gap-3" role="separator">
        <span className="h-px flex-1 bg-companion-divider" />
        <span className="text-[11.5px] font-bold uppercase text-companion-text-tertiary">
          {t('companion.review.answer')}
        </span>
        <span className="h-px flex-1 bg-companion-divider" />
      </div>
      <div className="pt-5">
        <CompanionArticleDocument content={props.reveal} layout="review" nodeId={`${props.nodeId}::answer`} />
      </div>
    </section>
  );
}

function resolveReviewSourceLabel(items: CompanionReviewBreadcrumbItem[]) {
  return items.find((item) => item.isCurrent)?.label ?? items.at(-1)?.label ?? null;
}

function ReviewSourceEyebrow(props: { items: CompanionReviewBreadcrumbItem[] }) {
  const label = resolveReviewSourceLabel(props.items);
  if (!label) {
    return null;
  }
  return (
    <div className="mb-2 flex items-center gap-2 px-6 text-[11.5px] font-semibold uppercase text-companion-accent">
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-companion-accent" />
      <span className="line-clamp-1">{label}</span>
    </div>
  );
}

export function CompanionReviewCard(props: {
  breadcrumbItems?: CompanionReviewBreadcrumbItem[];
  card: CompanionReviewCardModel;
  onSelectBreadcrumbItem?: (id: string) => void;
}) {
  const t = useTranslation();
  const breadcrumbItems = props.breadcrumbItems ?? [];
  return (
    <section aria-label={t('companion.review.card')} className="bg-companion-content pb-4 pt-1">
      <ReviewBreadcrumb items={breadcrumbItems} {...definedProps({ onSelectItem: props.onSelectBreadcrumbItem })} />
      <div>
        <ReviewSourceEyebrow items={breadcrumbItems} />
        <CompanionArticleDocument
          content={props.card.content}
          hideTitleHeading={props.card.hideTitleHeading}
          layout="review"
          nodeId={props.card.nodeId}
        />
      </div>
    </section>
  );
}

export function CompanionReviewAnswer(props: { card: CompanionReviewCardModel }) {
  if (!props.card.reveal) {
    return null;
  }
  return <ReviewAnswer nodeId={props.card.nodeId} reveal={props.card.reveal} />;
}
