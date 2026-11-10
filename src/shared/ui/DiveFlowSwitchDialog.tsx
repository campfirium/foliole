import { Check, X } from 'lucide-react';
import type { CSSProperties, KeyboardEvent, ReactElement } from 'react';

import type { DiveFlowCursor } from '../../../lib/core/flow/dailyFlowSession';
import type { Dive } from '../../../lib/core/nodes/dive';
import { useTranslation } from '../localization/LocalizationProvider';

import {
  AppDialog, AppDialogClose, AppDialogContent,
  AppDialogOverlay, AppDialogPortal, AppDialogTitle, AppDialogTrigger
} from './Dialog';
import { appFloatingItemClassName, appFloatingListClassName } from './FloatingSurface';
import { AppIconButton } from './IconButton';

export function useDiveFlowCheckpointTitle(dive?: DiveFlowCursor) {
  const t = useTranslation();
  if (!dive) return undefined;
  if (dive.phase === 'initial') return t('desktop.diveCheckpoint.queueClear');
  if (dive.phase === 'topics') return t(dive.stop === 'finished'
    ? 'desktop.diveCheckpoint.readingComplete' : 'desktop.diveCheckpoint.noUnread');
  return t('desktop.diveCheckpoint.clearForNow');
}

function handleDiveShortcut(event: KeyboardEvent<HTMLDivElement>) {
  if (event.defaultPrevented || event.nativeEvent.isComposing || event.repeat ||
      event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !/^[1-9]$/.test(event.key)) return;
  const row = event.currentTarget.querySelector<HTMLButtonElement>(`button[aria-keyshortcuts="${event.key}"]`);
  if (!row) return;
  event.preventDefault();
  event.stopPropagation();
  row.click();
}

export function DiveFlowSwitchDialog({ currentId, dives, trigger, onSwitch, onOpenChange, container, position, desktop = false }: {
  currentId: string;
  dives: readonly Dive[];
  trigger: ReactElement;
  onSwitch: (dive: Dive) => void;
  onOpenChange?: (open: boolean) => void;
  container?: HTMLElement | null;
  position?: CSSProperties;
  desktop?: boolean;
}) {
  const t = useTranslation();
  return (
    <AppDialog onOpenChange={onOpenChange}>
      <AppDialogTrigger asChild>{trigger}</AppDialogTrigger>
      <AppDialogPortal container={container ?? null}>
        <AppDialogOverlay className="bg-[var(--app-floating-overlay-bg)]" />
        <AppDialogContent aria-describedby={undefined} style={position} className="w-dialog-notice overflow-hidden"
          onKeyDown={desktop ? handleDiveShortcut : undefined}>
          <div className="flex min-h-14 items-center justify-between gap-2 border-b border-[var(--app-floating-divider-color)] px-4 py-2">
            <AppDialogTitle>{t(desktop ? 'desktop.nodeList.dive.switchFlow' : 'desktop.nodeList.dive.selectDive')}</AppDialogTitle>
            {!desktop && <AppDialogClose asChild>
              <AppIconButton label={t('common.cancel')} className="size-11"
                icon={<X aria-hidden className="size-4" />} />
            </AppDialogClose>}
          </div>
          <ul className={appFloatingListClassName()}>
            {dives.map((target, index) => {
              const current = target.id === currentId;
              const shortcut = desktop && index < 9 ? String(index + 1) : undefined;
              return (
                <li key={target.id}>
                  <AppDialogClose asChild>
                    <button aria-current={current || undefined} aria-keyshortcuts={shortcut} data-active={current} type="button"
                      className={appFloatingItemClassName('flex min-h-11 items-center gap-3 text-ui-md text-foreground')}
                      onClick={() => { if (!current) onSwitch(target); }}>
                      {desktop && <span aria-hidden className="w-4 shrink-0 text-foreground/60 tabular-nums">{shortcut}</span>}
                      <span className="min-w-0 flex-1 break-words">{target.title}</span>
                      {current && <Check aria-hidden className="size-4 shrink-0" />}
                    </button>
                  </AppDialogClose>
                </li>
              );
            })}
          </ul>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
