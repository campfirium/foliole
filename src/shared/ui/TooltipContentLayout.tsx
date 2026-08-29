import type { ReactNode } from 'react';

export function AppTooltipContentLayout(props: { description: ReactNode; title: ReactNode }) {
  return (
    <span className="block">
      <span className="block font-medium text-foreground">{props.title}</span>
      <span className="mt-1 block text-foreground/70">{props.description}</span>
    </span>
  );
}
