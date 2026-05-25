import { BookOpenText, Check, ListChecks, ListFilter, Route } from 'lucide-react';
import { useState, type SVGProps } from 'react';

import type { ReviewSessionMode } from '../../features/review/model/reviewSessionMode';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger
} from '../../shared/ui';

const SESSION_MODES: Array<{
  id: ReviewSessionMode;
  label: string;
  Icon: typeof ListFilter;
}> = [
  {
    id: 'recommended',
    label: 'Review and reading',
    Icon: Route
  },
  {
    id: 'review-first',
    label: 'Review first',
    Icon: ListChecks
  },
  {
    id: 'reading-only',
    label: 'Reading only',
    Icon: BookOpenText
  }
];

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
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const activeMode = SESSION_MODES.find((item) => item.id === mode) ?? SESSION_MODES[0]!;
  const isTemporaryMode = activeMode.id !== 'recommended';
  const ActiveIcon = activeMode.Icon;

  return (
    <AppDropdownMenu onOpenChange={setIsMenuOpen} open={isMenuOpen}>
      <AppDropdownMenuTrigger asChild>
        <button
          aria-label={isTemporaryMode ? `Session mode: ${activeMode.label}` : 'Change session mode'}
          className={modeButtonClassName(isTemporaryMode)}
          onClick={() => setIsMenuOpen(true)}
          title={isTemporaryMode ? `Session mode: ${activeMode.label}` : 'Change session mode'}
          type="button"
        >
          <ActiveIcon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.9} />
        </button>
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent align="start" className="w-80 max-w-[calc(100vw-2rem)] p-1" sideOffset={8}>
        {SESSION_MODES.map((item) => {
          const Icon = item.Icon;
          const isSelected = item.id === mode;
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
                  <span className="truncate text-[13px] font-medium">{item.label}</span>
                  {item.id === 'recommended' ? (
                    <span className="shrink-0 text-[10px] font-medium text-foreground/38">RECOMMENDED</span>
                  ) : null}
                </span>
              </span>
              {isSelected ? <Check aria-hidden="true" className="size-4 text-accent-strong" strokeWidth={2.1} /> : null}
            </AppDropdownMenuItem>
          );
        })}
        <div className="px-3 pt-1 pb-2 text-xs text-foreground/45">Temporary setting.</div>
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}

export function QueueClearFlowControl() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <AppDropdownMenu onOpenChange={setIsMenuOpen} open={isMenuOpen}>
      <AppDropdownMenuTrigger asChild>
        <button
          aria-label="Queue clear"
          className={queueClearButtonClassName()}
          onClick={() => setIsMenuOpen(true)}
          title="Queue clear"
          type="button"
        >
          <PlanetIcon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.9} />
        </button>
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent align="start" className="w-56 max-w-[calc(100vw-2rem)] p-3" sideOffset={8}>
        <p className="text-[13px] font-medium text-foreground/82">Queue clear. Flow on.</p>
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
