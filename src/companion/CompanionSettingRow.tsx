import type { ReactNode } from 'react';

/** A mobile settings row with its control beside the title and the explanation below. */
export function CompanionSettingRow(props: { title: string; description: string; children: ReactNode }) {
  return <div className="border-b border-companion-divider py-3">
    <div className="flex min-h-11 items-center justify-between gap-3">
      <span className="text-ui-lg font-normal text-foreground">{props.title}</span>
      {props.children}
    </div>
    <p className="mt-1 text-sm leading-5 text-companion-text-secondary">{props.description}</p>
  </div>;
}
