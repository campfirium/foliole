import type { ReviewActionButtonPresentation } from '../shared/ui/reviewActionPresentation';

export function CompanionReviewTouchButton(props: ReviewActionButtonPresentation) {
  return (
    <button
      aria-label={props.label}
      className="companion-review-touch-button min-w-0 flex-1 focus:outline-none disabled:pointer-events-none disabled:opacity-45"
      data-testid={props.testId}
      disabled={props.disabled}
      onClick={props.onClick}
      title={props.title}
      type="button"
    >
      <span className="companion-review-button-face">{props.label}</span>
    </button>
  );
}
