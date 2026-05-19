import { BookOpenText, Check, ListChecks, ListFilter, Route } from 'lucide-react';
import { useState } from 'react';

import type { ReviewSessionMode } from '../../features/review/model/reviewSessionMode';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuLabel,
  AppDropdownMenuTrigger
} from '../../shared/ui';

const SESSION_MODES: Array<{
  id: ReviewSessionMode;
  label: string;
  note: string;
  Icon: typeof ListFilter;
}> = [
  {
    id: 'recommended',
    label: 'Recommended flow',
    note: 'Reading and review items stay mixed at 1:5.',
    Icon: Route
  },
  {
    id: 'review-first',
    label: 'Review items first',
    note: 'Handle due review items before reading.',
    Icon: ListChecks
  },
  {
    id: 'reading-only',
    label: 'Reading only',
    note: 'Use this session for reading topics.',
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

function menuItemClassName(isSelected: boolean) {
  return [
    'grid min-h-12 grid-cols-[1.25rem_minmax(0,1fr)_1.25rem] items-center gap-2.5 rounded-md px-3 py-2',
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
          type="button"
        >
          <ActiveIcon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.9} />
        </button>
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent align="start" className="w-96 max-w-[calc(100vw-2rem)] p-1" sideOffset={8}>
        <AppDropdownMenuLabel className="px-3 pt-2 pb-1 text-xs font-medium text-foreground/45">
          This session
        </AppDropdownMenuLabel>
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
                <span className="block truncate text-[13px] font-medium">{item.label}</span>
                <span className="block truncate text-xs font-normal text-foreground/52">{item.note}</span>
              </span>
              {isSelected ? <Check aria-hidden="true" className="size-4 text-accent-strong" strokeWidth={2.1} /> : null}
            </AppDropdownMenuItem>
          );
        })}
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}
