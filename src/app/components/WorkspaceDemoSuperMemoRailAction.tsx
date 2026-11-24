import { DatabaseBackup } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';

import { WorkspaceRailTooltipButton } from './WorkspaceRailTooltipButton';

const SuperMemoDemoDialog = lazy(() =>
  import('../../features/import/components/SuperMemoDemoDialog')
    .then((module) => ({ default: module.SuperMemoDemoDialog }))
);

export function WorkspaceDemoSuperMemoRailAction() {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div
      className="flex h-[var(--workspace-top-toolbar-height)] items-center justify-center"
      // The dialog is portalled, but its events still bubble to the rail context menu through React.
      onContextMenu={(event) => event.stopPropagation()}
    >
      <WorkspaceRailTooltipButton
        className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
        icon={<DatabaseBackup aria-hidden="true" size={16} strokeWidth={1.75} />}
        label={t('desktop.command.importSuperMemo')}
        onClick={() => setOpen(true)}
      />
      {open ? (
        <Suspense fallback={null}>
          <SuperMemoDemoDialog onClose={() => setOpen(false)} />
        </Suspense>
      ) : null}
    </div>
  );
}
