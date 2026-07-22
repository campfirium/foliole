import type { ReactNode } from 'react';

import { SettingsControlSlot } from '../../../../shared/ui';

export function PublishingSetupStep(props: {
  children?: ReactNode;
  description: ReactNode;
  step: number;
  title: string;
}) {
  return (
    <div className="relative grid min-h-settings-row grid-cols-[2rem_minmax(0,1fr)] gap-3 px-settings-panel-x py-settings-panel-y before:absolute before:left-settings-panel-x before:right-settings-panel-x before:top-0 before:hidden before:border-t before:border-settings-divider/70 first:before:hidden" data-settings-row>
      <span className="flex size-8 items-center justify-center rounded-full border border-settings-control-border text-ui-md text-foreground/75">{props.step}</span>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,420px)] items-start gap-6 max-[1080px]:grid-cols-1">
        <div className="min-w-0">
          <h5 className="text-ui-lg font-semibold text-foreground">{props.title}</h5>
          <p className="mt-1 max-w-[720px] text-ui-md leading-6 text-foreground/64">{props.description}</p>
        </div>
        {props.children ? <SettingsControlSlot className="w-full">{props.children}</SettingsControlSlot> : null}
      </div>
    </div>
  );
}
