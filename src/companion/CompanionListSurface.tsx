import { ArrowUpRight, ChevronRight, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function CompanionListSection(props: { children: ReactNode; isFirst?: boolean; title?: string }) {
  return (
    <section data-companion-list-section className={props.isFirst ? '' : 'pt-5'}>
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
  href?: string;
  openInNewTab?: boolean;
  onClick?(): void;
  showIcon?: boolean;
  subtitle?: ReactNode;
  testId?: string;
  title: ReactNode;
  titleClassName?: string;
}) {
  const Row = props.href ? 'a' : 'button';
  const Arrow = props.href ? ArrowUpRight : ChevronRight;
  return (
    <Row
      data-companion-list-row
      aria-label={props.ariaLabel}
      className="group flex min-h-14 w-full items-center gap-3 border-b border-companion-divider bg-transparent py-[15px] text-left last:border-b-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-companion-accent"
      data-testid={props.testId}
      {...(props.href ? { href: props.href, target: props.openInNewTab ? '_blank' : undefined, rel: 'noopener noreferrer' } : { onClick: props.onClick, type: 'button' as const })}
    >
      {props.showIcon ? <props.Icon aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-companion-text-secondary" /> : null}
      <span className="min-w-0 flex-1">
        <span data-companion-list-title className={`block text-[16px] font-medium leading-5 text-foreground ${props.titleClassName ?? ''}`}>
          {props.title}
        </span>
        {props.subtitle ? (
          <span data-companion-list-detail className="mt-1 block line-clamp-2 text-[12.5px] leading-[18px] text-companion-text-secondary">
            {props.subtitle}
          </span>
        ) : null}
        {props.children}
      </span>
      {props.meta ? (
        <span className="shrink-0 text-[12.5px] font-semibold leading-5 text-companion-text-tertiary">{props.meta}</span>
      ) : null}
      <Arrow aria-hidden="true"
        className={`h-[18px] w-[18px] shrink-0 ${
          props.accent ? 'text-companion-accent' : 'text-companion-text-tertiary'
        }`}
      />
    </Row>
  );
}
