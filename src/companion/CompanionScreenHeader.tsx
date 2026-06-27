import type { ReactNode } from 'react';

export function CompanionScreenHeader(props: {
  metric?: string;
  subtitle?: ReactNode;
  title: string;
}) {
  return (
    <div className="px-1 pb-3 pt-1">
      <div className="flex items-end justify-between gap-4">
        <h1 className="text-[28px] font-bold leading-8 text-foreground">{props.title}</h1>
        {props.metric ? (
          <span className="pb-0.5 text-[12.5px] font-semibold leading-5 text-companion-accent">{props.metric}</span>
        ) : null}
      </div>
      {props.subtitle ? (
        <p className="mt-1 text-[13px] leading-5 text-companion-text-secondary">{props.subtitle}</p>
      ) : null}
    </div>
  );
}
