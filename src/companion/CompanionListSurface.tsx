import { ChevronRight, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function CompanionListSection(props: { children: ReactNode; isFirst?: boolean; title?: string }) {
  return (
    <section className={props.isFirst ? '' : 'pt-5'}>
      {props.title ? (
        <h2 className="pb-2 text-[12px] font-normal text-companion-text-tertiary">
          {props.title}
        </h2>
      ) : null}
      <div className="overflow-hidden">{props.children}</div>
    </section>
  );
}

export function CompanionListRow(props: {
  accent?: boolean;
  ariaLabel: string;
  children?: ReactNode;
  Icon: LucideIcon;
  isCurrent?: boolean;
  meta?: ReactNode;
  onClick(): void;
  subtitle?: ReactNode;
  testId?: string;
  title: ReactNode;
  titleClassName?: string;
}) {
  return (
    <button
      aria-label={props.ariaLabel}
      className="group flex min-h-14 w-full items-center gap-3 border-b border-companion-divider bg-transparent py-[15px] text-left last:border-b-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-companion-accent"
      data-testid={props.testId}
      onClick={props.onClick}
      type="button"
    >
      <span className="min-w-0 flex-1">
        <span className={`block text-[16px] font-medium leading-5 text-foreground ${props.titleClassName ?? ''}`}>
          {props.title}
        </span>
        {props.subtitle ? (
          <span className="mt-1 block line-clamp-2 text-[12.5px] leading-[18px] text-companion-text-secondary">
            {props.subtitle}
          </span>
        ) : null}
        {props.children}
      </span>
      {props.meta ? (
        <span className="shrink-0 text-[12.5px] font-semibold leading-5 text-companion-text-tertiary">{props.meta}</span>
      ) : null}
      <ChevronRight
        className={`h-[18px] w-[18px] shrink-0 ${
          props.accent ? 'text-companion-accent' : 'text-companion-text-tertiary'
        }`}
      />
    </button>
  );
}
