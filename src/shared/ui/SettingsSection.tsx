import { ChevronRight } from 'lucide-react';
import { useId, type ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';

export interface SettingsSectionProps {
  actions?: ReactNode;
  ariaLabel?: string;
  children: ReactNode;
  className?: string;
  description?: string;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  searchRowId?: string;
  title?: string;
  titleActions?: ReactNode;
}

function SettingsSectionHeader(props: {
  actions: ReactNode;
  contentId: string;
  description: string | undefined;
  descriptionId: string;
  expanded: boolean | undefined;
  isDisclosure: boolean;
  onExpandedChange: ((expanded: boolean) => void) | undefined;
  title: string | undefined;
  titleActions: ReactNode;
}) {
  if (!props.isDisclosure) {
    return <StaticSettingsSectionHeader {...props} />;
  }
  return (
    <div className="flex items-start justify-between gap-4">
      <h3 aria-label={props.title} className="min-w-0 flex-1">
        <button
          aria-controls={props.contentId}
          aria-describedby={props.description ? props.descriptionId : undefined}
          aria-expanded={props.expanded}
          aria-label={props.title}
          className="group flex w-full items-start gap-2 rounded-sm px-1 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onClick={() => props.onExpandedChange?.(!props.expanded)}
          type="button"
        >
          <ChevronRight
            aria-hidden="true"
            className={cn(
              'mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:text-foreground',
              props.expanded && 'rotate-90'
            )}
            strokeWidth={1.8}
          />
          <span className="min-w-0">
            <span className="block text-ui-lg font-semibold text-foreground">{props.title}</span>
            {props.description ? (
              <span
                className="mt-1 block max-w-[760px] text-ui-md font-normal leading-6 text-muted-foreground"
                id={props.descriptionId}
              >
                {props.description}
              </span>
            ) : null}
          </span>
        </button>
      </h3>
      {props.actions ? <div className="shrink-0">{props.actions}</div> : null}
    </div>
  );
}

function StaticSettingsSectionHeader(props: {
  actions: ReactNode;
  description: string | undefined;
  title: string | undefined;
  titleActions: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        {props.title ? (
          <div className="flex items-center gap-2">
            <h3 className="text-ui-lg font-semibold text-foreground">{props.title}</h3>
            {props.titleActions}
          </div>
        ) : null}
        {props.description ? (
          <p className="mt-1 max-w-[760px] text-ui-md leading-6 text-muted-foreground">{props.description}</p>
        ) : null}
      </div>
      {props.actions ? <div className="shrink-0">{props.actions}</div> : null}
    </div>
  );
}

export function SettingsSection({
  actions,
  ariaLabel,
  children,
  className,
  description,
  expanded,
  onExpandedChange,
  searchRowId,
  title,
  titleActions
}: SettingsSectionProps) {
  const hasHeader = Boolean(title || description || actions);
  const contentId = useId();
  const descriptionId = useId();
  const isDisclosure = Boolean(title && typeof expanded === 'boolean' && onExpandedChange);

  return (
    <section
      aria-label={ariaLabel}
      data-settings-search-row-id={searchRowId}
      className={cn(
        'relative mb-8 pt-7 before:absolute before:left-settings-panel-x before:right-settings-panel-x before:top-0 before:border-t before:border-settings-divider/70 first:pt-0 first:before:hidden last:mb-0',
        className
      )}
    >
      {hasHeader ? (
        <div className="px-settings-panel-x pb-3">
          <SettingsSectionHeader
            actions={actions}
            contentId={contentId}
            description={description}
            descriptionId={descriptionId}
            expanded={expanded}
            isDisclosure={isDisclosure}
            onExpandedChange={onExpandedChange}
            title={title}
            titleActions={titleActions}
          />
        </div>
      ) : null}
      <div
        hidden={isDisclosure && !expanded}
        id={isDisclosure ? contentId : undefined}
        className={cn(
          'overflow-hidden',
          isDisclosure && 'pl-7',
          '[&>[data-settings-row]+[data-settings-row]]:before:block'
        )}
      >
        {children}
      </div>
    </section>
  );
}
