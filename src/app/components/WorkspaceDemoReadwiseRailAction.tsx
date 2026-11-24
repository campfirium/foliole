import { BookMarked } from 'lucide-react';

import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { useTranslation } from '../../shared/localization/LocalizationProvider';

import { WorkspaceRailTooltipButton } from './WorkspaceRailTooltipButton';

export function WorkspaceDemoReadwiseRailAction({ onRun }: { onRun: (commandId: string) => void }) {
  const t = useTranslation();
  return (
    <div className="flex h-[var(--workspace-top-toolbar-height)] items-center justify-center">
      <WorkspaceRailTooltipButton
        className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
        icon={<BookMarked aria-hidden="true" size={16} strokeWidth={1.75} />}
        label={t('settings.demoPreview.rail.readwise')}
        onClick={() => onRun(APP_COMMAND_IDS.openReadwiseReaderSettings)}
      />
    </div>
  );
}
