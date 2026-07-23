import type { ReactNode } from 'react';

import { SETTINGS_WIDE_CONTROL_WIDTH_CLASS_NAME, SettingsControlSlot } from './SettingsLayout';

import { cn } from '@/shared/lib/utils';

export function SettingsFlow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('relative', className)} data-settings-flow>
      {children}
    </div>
  );
}

export function SettingsFlowItem({ children, control }: { children: ReactNode; control?: ReactNode }) {
  return (
    <div
      className="relative grid min-h-settings-row grid-cols-[1rem_minmax(0,1fr)] gap-3 px-settings-panel-x py-settings-panel-y before:pointer-events-none before:absolute before:-bottom-7 before:left-7 before:top-7 before:w-px before:bg-settings-divider/70 last:before:hidden after:absolute after:bottom-0 after:left-12 after:right-settings-panel-x after:border-t after:border-settings-divider/70 last:after:hidden"
      data-settings-flow-item
    >
      <span aria-hidden="true" className="relative z-[1] flex size-4 items-center justify-center self-start" data-settings-flow-marker>
        <span className="size-1.5 rounded-full bg-foreground/45" />
      </span>
      <div className="flex min-w-0 items-start justify-between gap-6 max-[1080px]:flex-col">
        {children}
        {control ? (
          <SettingsControlSlot className={SETTINGS_WIDE_CONTROL_WIDTH_CLASS_NAME}>
            {control}
          </SettingsControlSlot>
        ) : null}
      </div>
    </div>
  );
}
