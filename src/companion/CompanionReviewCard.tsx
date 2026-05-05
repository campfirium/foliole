import { CompanionArticleDocument } from './CompanionArticleDocument';
import type { CompanionReviewCard as CompanionReviewCardModel } from './companionReviewSession';

function ReviewMetadata(props: { due: string; remainingCount: number; title: string; totalCount: number }) {
  return (
    <header className="rounded-3xl border border-border bg-bg-panel px-4 py-4">
      <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.16em] text-foreground/56">
        <span>Review</span>
        <span>
          {props.totalCount - props.remainingCount + 1}/{props.totalCount}
        </span>
      </div>
      <h1 className="mt-3 text-lg font-semibold text-foreground">{props.title}</h1>
      <p className="mt-2 text-sm leading-6 text-foreground/72">
        Due {new Date(props.due).toLocaleString()}
      </p>
    </header>
  );
}

function ReviewAnswer(props: { nodeId: string; reveal: string }) {
  return (
    <section className="mt-4 rounded-3xl border border-border bg-canvas px-4 py-4">
      <div className="text-xs uppercase tracking-[0.16em] text-foreground/56">Answer</div>
      <div className="mt-3">
        <CompanionArticleDocument content={props.reveal} nodeId={`${props.nodeId}::answer`} />
      </div>
    </section>
  );
}

export function CompanionReviewCard(props: { card: CompanionReviewCardModel }) {
  return (
    <section aria-label="Review card" className="pb-4">
      <ReviewMetadata
        due={props.card.due}
        remainingCount={props.card.remainingCount}
        title={props.card.title}
        totalCount={props.card.totalCount}
      />
      <div className="mt-4 rounded-3xl border border-border bg-canvas px-2 py-2">
        <div className="px-3 pt-2 text-xs uppercase tracking-[0.16em] text-foreground/56">Prompt</div>
        <CompanionArticleDocument content={props.card.content} nodeId={props.card.nodeId} />
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
