import type { ReactNode } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppButton, appShelllessSurfaceClassName } from '../shared/ui';

import type { CompanionShellModel } from './CompanionShell';
import { useCompanionNodeLink } from './useCompanionNodeLink';

export function CompanionNodeLinkRuntime({ model, children }: { model: CompanionShellModel; children: ReactNode }) {
  const t = useTranslation();
  const link = useCompanionNodeLink({
    ready: model.workspaceSync.isWorkspaceSyncStateReady && !model.isCaptureSheetOpen &&
      !model.surface.isSubmittingGrade && !model.surface.isSubmittingReadingAction,
    snapshot: model.workspaceSync.state.workspace_snapshot,
    open: (nodeId) => {
      model.handleNavigationAction('recent');
      model.handleExitSearchExternalDocument();
      model.handleExitSearchPdf();
      model.surface.handleSelectRecentArticle(nodeId);
    }
  });
  return <>
    {children}
    {link.result && link.result !== 'opened' ? (
      <div className="pointer-events-none fixed inset-0 z-workspace-overlay flex items-center justify-center px-6">
        <div className={appShelllessSurfaceClassName('pointer-events-auto flex max-w-sm flex-col gap-3 px-4 py-3 text-ui-md')}>
          <p data-mobile-link-error={link.result} role="status">{t('companion.link.unavailable')}</p>
          <AppButton data-testid="companion-link-dismiss" onClick={link.dismiss} variant="subtle">{t('companion.link.dismiss')}</AppButton>
        </div>
      </div>
    ) : null}
  </>;
}
