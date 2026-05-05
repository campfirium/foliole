import { Fragment } from 'react';

import { CompanionArticleDocument } from './CompanionArticleDocument';
import type { CompanionReviewBreadcrumbItem } from './companionReviewBreadcrumbs';
import type { CompanionReviewCard as CompanionReviewCardModel } from './companionReviewSession';

function ReviewBreadcrumb(props: {
  items: CompanionReviewBreadcrumbItem[];
  onSelectItem?: (id: string) => void;
}) {
  if (props.items.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Review breadcrumb" className="mb-4 px-6">
      <div className="line-clamp-2 text-[12px] leading-5 text-companion-text-secondary">
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
  return (
    <section className="mt-5 border-t border-companion-divider px-1 pt-5">
      <div className="text-[12px] font-medium tracking-[0.08em] text-companion-text-secondary">Answer</div>
      <div className="mt-3">
        <CompanionArticleDocument content={props.reveal} nodeId={`${props.nodeId}::answer`} />
      </div>
    </section>
  );
}

export function CompanionReviewCard(props: {
  breadcrumbItems?: CompanionReviewBreadcrumbItem[];
  card: CompanionReviewCardModel;
  onSelectBreadcrumbItem?: (id: string) => void;
}) {
  return (
    <section aria-label="Review card" className="bg-companion-content pb-4">
      <ReviewBreadcrumb items={props.breadcrumbItems ?? []} onSelectItem={props.onSelectBreadcrumbItem} />
      <div className="pt-1">
        <CompanionArticleDocument
          content={props.card.content}
          hideTitleHeading={props.card.hideTitleHeading}
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
