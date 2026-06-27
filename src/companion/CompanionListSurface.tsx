import { ChevronRight, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function CompanionListSection(props: { children: ReactNode; isFirst?: boolean; title?: string }) {
  return (
    <section className={props.isFirst ? '' : 'border-t border-companion-divider pt-5'}>
      {props.title ? (
        <h2 className="px-1 pb-2 text-[11.5px] font-semibold uppercase text-companion-text-tertiary">
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
  title: ReactNode;
  titleClassName?: string;
}) {
  const Icon = props.Icon;
  return (
    <button
      aria-label={props.ariaLabel}
      className={`group flex min-h-14 w-full items-center gap-3 border-b border-companion-divider px-1 py-3 text-left transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-companion-accent ${
        props.isCurrent ? 'bg-companion-subtle' : 'bg-transparent hover:bg-companion-subtle/60 active:bg-companion-subtle/80'
      }`}
      onClick={props.onClick}
      type="button"
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${
          props.accent
            ? 'bg-companion-accent-soft text-companion-accent'
            : 'bg-companion-subtle text-companion-text-secondary'
        }`}
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[15px] font-semibold leading-5 text-foreground ${props.titleClassName ?? ''}`}>
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
