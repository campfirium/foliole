import type { ReactNode } from 'react';

import { SettingsFlowItem } from '../../../../shared/ui';

export function PublishingSetupStep(props: {
  children?: ReactNode;
  description: ReactNode;
  title: string;
}) {
  return (
    <SettingsFlowItem control={props.children}>
      <div className="min-w-0 flex-1">
        <h5 className="text-ui-lg font-semibold text-foreground">{props.title}</h5>
        <p className="mt-1 max-w-[720px] text-ui-md leading-6 text-foreground/64">{props.description}</p>
      </div>
    </SettingsFlowItem>
  );
}
