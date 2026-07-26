import { useState } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { ReviewOverlayActionButton, ReviewOverlayDivider } from '../../shared/ui/ReviewOverlayActionButton';

import type { DocumentComparisonMode } from './documentComparisonView';

interface SourceUpdatePanelActionBarProps {
  comparisonMode: DocumentComparisonMode;
  manualContent: string;
  onAcceptIncomingUpdate?: () => Promise<void>;
  onDismissIncomingUpdate?: () => Promise<void>;
  onImportIncomingUpdateAsNew?: () => Promise<void>;
  onManualSaveAsTopic: () => Promise<void>;
  onManualSetAsBody: () => Promise<void>;
}

type PendingAction = 'accept' | 'dismiss' | 'importAsNew' | 'saveManual' | 'setManual';

function ManualActions(props: SourceUpdatePanelActionBarProps & {
  onAction: (action: PendingAction, run: () => Promise<void>) => void;
  pendingAction: PendingAction | null;
}) {
  const t = useTranslation();
  const disabled = Boolean(props.pendingAction) || !props.manualContent.trim();
  return (
    <>
      <ReviewOverlayActionButton
        className="min-w-32 font-medium text-foreground/86"
        disabled={disabled}
        label={t('desktop.sourceUpdate.manual.setAsBody')}
        loading={props.pendingAction === 'setManual'}
        loadingLabel={t('desktop.sourceUpdate.settingAsBody')}
        onClick={() => props.onAction('setManual', props.onManualSetAsBody)}
      />
      <ReviewOverlayDivider />
      <ReviewOverlayActionButton
        className="min-w-36 text-foreground/68"
        disabled={disabled}
        label={t('desktop.sourceUpdate.manual.saveAsTopic')}
        loading={props.pendingAction === 'saveManual'}
        loadingLabel={t('desktop.sourceUpdate.manual.savingAsTopic')}
        onClick={() => props.onAction('saveManual', props.onManualSaveAsTopic)}
      />
    </>
  );
}

function SourceActions(props: SourceUpdatePanelActionBarProps & {
  onAction: (action: PendingAction, run: () => Promise<void>) => void;
  pendingAction: PendingAction | null;
}) {
  const t = useTranslation();
  const disabled = Boolean(props.pendingAction);
  const isAlternative = props.comparisonMode === 'sync_alternative';
  return (
    <>
      {props.onAcceptIncomingUpdate ? (
        <ReviewOverlayActionButton
          className="min-w-32 font-medium text-foreground/86"
          disabled={disabled}
          label={t(isAlternative ? 'desktop.sourceUpdate.setAsBody' : 'desktop.sourceUpdate.accept')}
          loading={props.pendingAction === 'accept'}
          loadingLabel={t(isAlternative ? 'desktop.sourceUpdate.settingAsBody' : 'desktop.sourceUpdate.accepting')}
          onClick={() => props.onAction('accept', props.onAcceptIncomingUpdate!)}
        />
      ) : null}
      {props.onDismissIncomingUpdate ? (
        <>
          <ReviewOverlayDivider />
          <ReviewOverlayActionButton
            className="min-w-24 text-foreground/68"
            disabled={disabled}
            label={t('desktop.sourceUpdate.dismiss')}
            onClick={() => props.onAction('dismiss', props.onDismissIncomingUpdate!)}
          />
        </>
      ) : null}
      {props.onImportIncomingUpdateAsNew ? (
        <>
          <ReviewOverlayDivider />
          <ReviewOverlayActionButton
            className="min-w-32 text-foreground/68"
            disabled={disabled}
            label={t('desktop.sourceUpdate.importAsNew')}
            loading={props.pendingAction === 'importAsNew'}
            loadingLabel={t('desktop.sourceUpdate.importingAsNew')}
            onClick={() => props.onAction('importAsNew', props.onImportIncomingUpdateAsNew!)}
          />
        </>
      ) : null}
    </>
  );
}

export function SourceUpdatePanelActionBar(props: SourceUpdatePanelActionBarProps) {
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const handleAction = async (action: PendingAction, run: () => Promise<void>) => {
    if (pendingAction) return;
    setPendingAction(action);
    try {
      await run();
    } catch {
      // The owning panel remains open with its current draft so the action can be retried.
    } finally {
      setPendingAction(null);
    }
  };
  const hasSourceActions = Boolean(
    props.onAcceptIncomingUpdate || props.onDismissIncomingUpdate || props.onImportIncomingUpdateAsNew
  );
  if (props.comparisonMode !== 'manual' && !hasSourceActions) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-local-raised flex justify-center">
      <div className="pointer-events-auto flex min-h-10 items-center rounded-lg border border-border bg-[var(--app-floating-surface-bg)] px-2 shadow-popover">
        {props.comparisonMode === 'manual'
          ? <ManualActions {...props} onAction={(action, run) => void handleAction(action, run)} pendingAction={pendingAction} />
          : <SourceActions {...props} onAction={(action, run) => void handleAction(action, run)} pendingAction={pendingAction} />}
      </div>
    </div>
  );
}
