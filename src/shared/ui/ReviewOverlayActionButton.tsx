import { Fragment, type ReactNode } from 'react';

const overlayButtonClass =
  'inline-flex min-h-9 min-w-20 shrink-0 appearance-none items-center justify-center rounded-none border-0 bg-transparent px-5 text-ui-md text-foreground/82 shadow-none transition-colors hover:bg-transparent hover:text-foreground focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-strong disabled:pointer-events-none disabled:opacity-45';

export function ReviewOverlayActionButton(props: {
  ariaLabel?: string;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={props.ariaLabel ?? props.label}
      className={overlayButtonClass}
      disabled={props.disabled}
      onClick={props.onClick}
      style={{ background: 'transparent', border: 0, borderRadius: 0, boxShadow: 'none' }}
      type="button"
    >
      {props.label}
    </button>
  );
}

export function ReviewOverlayDivider() {
  return <span aria-hidden="true" className="h-4 w-px shrink-0 bg-[rgb(var(--color-border)/0.42)]" data-review-overlay-divider />;
}

export function renderOverlayDividedActions(items: ReadonlyArray<{ key: string; node: ReactNode }>, surface: 'panel' | 'overlay') {
  return items.map((item, index) => (
    <Fragment key={item.key}>
      {index > 0 && surface === 'overlay' ? <ReviewOverlayDivider /> : null}
      {item.node}
    </Fragment>
  ));
}
