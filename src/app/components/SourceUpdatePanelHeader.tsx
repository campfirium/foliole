import { FileUp, X } from 'lucide-react';
import { useState } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppButton } from '../../shared/ui';

interface SourceUpdatePanelHeaderProps {
  onAcceptIncomingUpdate?: () => Promise<void>;
  onDismissIncomingUpdate?: () => Promise<void>;
  onOpenChange: (open: boolean) => void;
}

export function SourceUpdatePanelHeader(props: SourceUpdatePanelHeaderProps) {
  const t = useTranslation();
  const [pendingAction, setPendingAction] = useState<'accept' | 'dismiss' | null>(null);
  const handleIncomingAction = async (action: 'accept' | 'dismiss', run: (() => Promise<void>) | undefined) => {
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
    <header className="flex h-11 flex-none items-center justify-between border-b border-border bg-[var(--app-floating-muted-bg)] px-3">
      <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
        <span className="flex size-7 items-center justify-center rounded-md border border-border bg-foreground/[0.03] text-foreground/70">
          <FileUp aria-hidden="true" size={15} strokeWidth={1.8} />
        </span>
        <span className="truncate">{t('desktop.sourceUpdate.reviewTitle')}</span>
      </div>
      <div className="flex items-center gap-2">
        {props.onDismissIncomingUpdate ? (
          <AppButton
            disabled={Boolean(pendingAction)}
            onClick={() => void handleIncomingAction('dismiss', props.onDismissIncomingUpdate)}
            size="sm"
            variant="ghost"
          >
            {t('desktop.sourceUpdate.dismiss')}
          </AppButton>
        ) : null}
        {props.onAcceptIncomingUpdate ? (
          <AppButton
            disabled={Boolean(pendingAction)}
            onClick={() => void handleIncomingAction('accept', props.onAcceptIncomingUpdate)}
            size="sm"
            variant="default"
          >
            {pendingAction === 'accept' ? t('desktop.sourceUpdate.accepting') : t('desktop.sourceUpdate.accept')}
          </AppButton>
        ) : null}
        <AppButton aria-label={t('desktop.sourceUpdate.close')} className="size-8 px-0" onClick={() => props.onOpenChange(false)} variant="ghost">
          <X aria-hidden="true" size={15} strokeWidth={1.9} />
        </AppButton>
      </div>
    </header>
  );
}
