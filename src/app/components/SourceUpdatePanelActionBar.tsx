import { useState } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { ReviewOverlayActionButton, ReviewOverlayDivider } from '../../shared/ui/ReviewOverlayActionButton';

interface SourceUpdatePanelActionBarProps {
  onAcceptIncomingUpdate?: () => Promise<void>;
  onDismissIncomingUpdate?: () => Promise<void>;
  onImportIncomingUpdateAsNew?: () => Promise<void>;
}

type PendingSourceUpdateAction = 'accept' | 'dismiss' | 'importAsNew';

function SourceUpdatePanelActionItems(props: SourceUpdatePanelActionBarProps & {
  onAction: (action: PendingSourceUpdateAction, run: (() => Promise<void>) | undefined) => void;
  pendingAction: PendingSourceUpdateAction | null;
}) {
  const t = useTranslation();
  const disabled = Boolean(props.pendingAction);
  const isTextAlternative = Boolean(props.onAcceptIncomingUpdate && props.onDismissIncomingUpdate && !props.onImportIncomingUpdateAsNew);

  return (
    <>
      {props.onAcceptIncomingUpdate ? (
        <ReviewOverlayActionButton
          className="min-w-32 font-medium text-foreground/86"
          disabled={disabled}
          label={t(isTextAlternative ? 'desktop.sourceUpdate.setAsBody' : 'desktop.sourceUpdate.accept')}
          loading={props.pendingAction === 'accept'}
          loadingLabel={t(isTextAlternative ? 'desktop.sourceUpdate.settingAsBody' : 'desktop.sourceUpdate.accepting')}
          onClick={() => props.onAction('accept', props.onAcceptIncomingUpdate)}
        />
      ) : null}
      {props.onDismissIncomingUpdate ? (
        <>
          <ReviewOverlayDivider />
          <ReviewOverlayActionButton
            className="min-w-24 text-foreground/68"
            disabled={disabled}
            label={t('desktop.sourceUpdate.dismiss')}
            onClick={() => props.onAction('dismiss', props.onDismissIncomingUpdate)}
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
            onClick={() => props.onAction('importAsNew', props.onImportIncomingUpdateAsNew)}
          />
        </>
      ) : null}
    </>
  );
}

export function SourceUpdatePanelActionBar(props: SourceUpdatePanelActionBarProps) {
  const [pendingAction, setPendingAction] = useState<PendingSourceUpdateAction | null>(null);
  const handleIncomingAction = async (action: PendingSourceUpdateAction, run: (() => Promise<void>) | undefined) => {
    if (!run || pendingAction) {
      return;
    }
    setPendingAction(action);
    try {
      await run();
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-local-raised flex justify-center">
      <div className="pointer-events-auto flex h-[42px] items-center rounded-[11px] border border-[rgb(var(--color-border)/0.48)] bg-white px-2 shadow-[0_16px_42px_rgba(15,23,42,0.10)]">
        <SourceUpdatePanelActionItems {...props} onAction={(action, run) => void handleIncomingAction(action, run)} pendingAction={pendingAction} />
      </div>
    </div>
  );
}
