import { BookOpenText, Check, ListChecks, ListFilter, Route } from 'lucide-react';
import { useState, type SVGProps } from 'react';

import type { ReviewSessionMode } from '../../features/review/model/reviewSessionMode';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger
} from '../../shared/ui';

const SESSION_MODES: Array<{
  id: ReviewSessionMode;
  Icon: typeof ListFilter;
}> = [
  {
    id: 'recommended',
    Icon: Route
  },
  {
    id: 'review-first',
    Icon: ListChecks
  },
  {
    id: 'reading-only',
    Icon: BookOpenText
  }
];

type ReviewSessionTranslate = ReturnType<typeof useTranslation>;

function getSessionModeLabel(mode: ReviewSessionMode, t: ReviewSessionTranslate) {
  if (mode === 'review-first') return t('desktop.reviewSession.mode.reviewFirst');
  if (mode === 'reading-only') return t('desktop.reviewSession.mode.readingOnly');
  return t('desktop.reviewSession.mode.recommended');
}

function modeButtonClassName(isTemporaryMode: boolean) {
  return [
    'inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-none',
    isTemporaryMode
      ? 'bg-foreground/[0.055] text-foreground/78 hover:bg-foreground/[0.08] focus-visible:bg-foreground/[0.08]'
      : 'bg-transparent text-foreground/32 hover:bg-foreground/[0.045] hover:text-foreground/68 focus-visible:bg-foreground/[0.05] focus-visible:text-foreground/72'
  ].join(' ');
}

function queueClearButtonClassName() {
  return [
    'inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-none',
    'bg-transparent text-foreground/38 hover:bg-foreground/[0.045] hover:text-foreground/68 focus-visible:bg-foreground/[0.05] focus-visible:text-foreground/72'
  ].join(' ');
}

function menuItemClassName(isSelected: boolean) {
  return [
    'grid min-h-10 grid-cols-[1.25rem_minmax(0,1fr)_1rem] items-center gap-2 rounded-md px-3 py-2',
    isSelected ? 'bg-foreground/[0.055] text-foreground' : 'text-foreground/80'
  ].join(' ');
}

export function ReviewSessionModeControl({
  mode,
  onChangeMode
}: {
  mode: ReviewSessionMode;
  onChangeMode: (mode: ReviewSessionMode) => void;
}) {
  const t = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const activeMode = SESSION_MODES.find((item) => item.id === mode) ?? SESSION_MODES[0]!;
  const isTemporaryMode = activeMode.id !== 'recommended';
  const ActiveIcon = activeMode.Icon;
  const activeLabel = getSessionModeLabel(activeMode.id, t);

  return (
    <AppDropdownMenu onOpenChange={setIsMenuOpen} open={isMenuOpen}>
      <AppDropdownMenuTrigger asChild>
        <button
          aria-label={isTemporaryMode ? t('desktop.reviewSession.mode.current', { mode: activeLabel }) : t('desktop.reviewSession.mode.change')}
          className={modeButtonClassName(isTemporaryMode)}
          onClick={() => setIsMenuOpen(true)}
          title={isTemporaryMode ? t('desktop.reviewSession.mode.current', { mode: activeLabel }) : t('desktop.reviewSession.mode.change')}
          type="button"
        >
          <ActiveIcon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.9} />
        </button>
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent align="start" className="w-80 max-w-[calc(100vw-2rem)] p-1" sideOffset={8}>
        {SESSION_MODES.map((item) => {
          const Icon = item.Icon;
          const isSelected = item.id === mode;
          const itemLabel = getSessionModeLabel(item.id, t);
          return (
            <AppDropdownMenuItem
              className={menuItemClassName(isSelected)}
              key={item.id}
              onSelect={() => {
                onChangeMode(item.id);
                setIsMenuOpen(false);
              }}
            >
              <Icon aria-hidden="true" className="size-4 text-foreground/62" strokeWidth={1.9} />
              <span className="min-w-0">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate text-[13px] font-medium">{itemLabel}</span>
                  {item.id === 'recommended' ? (
                    <span className="shrink-0 text-[10px] font-medium text-foreground/38">{t('desktop.reviewSession.mode.recommendedBadge')}</span>
                  ) : null}
                </span>
              </span>
              {isSelected ? <Check aria-hidden="true" className="size-4 text-accent-strong" strokeWidth={2.1} /> : null}
            </AppDropdownMenuItem>
          );
        })}
        <div className="px-3 pt-1 pb-2 text-xs text-foreground/45">{t('desktop.reviewSession.mode.temporary')}</div>
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}

export function QueueClearFlowControl() {
  const t = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <AppDropdownMenu onOpenChange={setIsMenuOpen} open={isMenuOpen}>
      <AppDropdownMenuTrigger asChild>
        <button
          aria-label={t('desktop.reviewSession.summary.clear')}
          className={queueClearButtonClassName()}
          onClick={() => setIsMenuOpen(true)}
          title={t('desktop.reviewSession.summary.clear')}
          type="button"
        >
          <PlanetIcon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.9} />
        </button>
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent align="start" className="w-56 max-w-[calc(100vw-2rem)] p-3" sideOffset={8}>
        <p className="text-[13px] font-medium text-foreground/82">{t('desktop.reviewSession.queueClear.description')}</p>
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}

function PlanetIcon({ className, strokeWidth = 2, ...svgProps }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      className={className}
      fill="none"
      focusable="false"
      height="24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      width="24"
      xmlns="http://www.w3.org/2000/svg"
      {...svgProps}
    >
      <circle cx="12" cy="12" r="8" />
      <path d="M4.05 13c-1.7 1.8-2.5 3.5-1.8 4.5 1.1 1.9 6.4 1 11.8-2s8.9-7.1 7.7-9c-.6-1-2.4-1.2-4.7-.7" />
    </svg>
  );
}
