import type { ReactNode } from 'react';

export function ImportCatalogListItem(props: {
  actions?: ReactNode;
  meta?: ReactNode;
  summary?: ReactNode;
  title: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <li>
      <div className="flex flex-col gap-3 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">{props.title}</div>
          {props.trailing ? <div className="shrink-0 pt-1 text-right">{props.trailing}</div> : null}
        </div>
        {props.summary ? <div className="min-w-0">{props.summary}</div> : null}
        {props.meta || props.actions ? (
          <div className="flex min-h-6 items-center justify-between gap-4">
            <div className="min-w-0 flex-1">{props.meta}</div>
            {props.actions ? <div className="shrink-0">{props.actions}</div> : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
