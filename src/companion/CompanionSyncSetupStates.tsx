import { useEffect, useState } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppSpinner } from '../shared/ui';

function PrimaryAction(props: {
  children: string;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  onClick(): void;
  testId?: string;
}) {
  return (
    <button
      aria-busy={props.loading || undefined}
      className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border-strong bg-foreground px-4 py-3 text-sm font-semibold text-bg-panel transition hover:opacity-90 disabled:cursor-not-allowed ${props.loading ? 'disabled:opacity-100' : 'disabled:opacity-45'}`}
      disabled={props.disabled || props.loading}
      data-testid={props.testId}
      onClick={props.onClick}
      type="button"
    >
      {props.loading ? <AppSpinner className="pointer-events-none shrink-0" decorative size="sm" /> : null}
      <span>{props.loading ? props.loadingLabel ?? props.children : props.children}</span>
    </button>
  );
}

function SyncStatusCard(props: {
  children?: React.ReactNode;
  detail?: React.ReactNode;
  title: string;
}) {
  return (
    <div className="rounded-2xl border border-companion-divider bg-companion-content px-5 py-5 text-foreground">
      <h3 className="text-lg font-semibold leading-tight">{props.title}</h3>
      {props.detail ? <div className="mt-3 text-sm leading-6 text-accent">{props.detail}</div> : null}
      {props.children ? <div className="mt-5">{props.children}</div> : null}
    </div>
  );
}

function useExpiryCountdown(expiresAtIso: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [expiresAtIso]);
  const expiresAt = new Date(expiresAtIso).getTime();
  const remainingMs = Math.max(0, expiresAt - now);
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  return { isExpired: remainingMs <= 0, remainingMs, remainingSeconds };
}

export function AwaitingApprovalState(props: {
  expiresAt: string;
  onCancel(): void;
}) {
  const t = useTranslation();
  const { isExpired, remainingMs, remainingSeconds } = useExpiryCountdown(props.expiresAt);
  const progressPct = Math.min(100, Math.max(0, (remainingMs / 45_000) * 100));
  return (
    <div data-testid="companion-sync-awaiting-approval">
      <SyncStatusCard
        detail={t('companion.syncSetup.approval.detail')}
        title={t('companion.syncSetup.approval.title')}
      >
        <div className="space-y-4">
        <div className="flex items-center gap-3 text-sm text-foreground">
          <span aria-hidden className="relative inline-flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-foreground opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-foreground" />
          </span>
          <span>{isExpired ? t('companion.syncSetup.expired') : t('companion.syncSetup.waiting', { seconds: remainingSeconds })}</span>
        </div>
        <div aria-hidden className="h-1.5 w-full overflow-hidden rounded-full bg-companion-subtle">
          <div className="h-full rounded-full bg-companion-accent transition-all duration-500 ease-linear" style={{ width: `${progressPct}%` }} />
        </div>
        <button
          className="w-full rounded-2xl border border-companion-divider px-4 py-3 text-sm font-medium text-foreground transition active:bg-companion-subtle/80"
          onClick={props.onCancel}
          type="button"
        >
          {t('common.cancel')}
        </button>
        </div>
      </SyncStatusCard>
    </div>
  );
}

export function EmptyDiscoveryState(props: {
  disabled: boolean;
  onTryAgain(): void;
}) {
  const t = useTranslation();
  return (
    <SyncStatusCard detail={t('companion.syncSetup.instructions')} title={t('companion.syncSetup.title')}>
      <div>
        <PrimaryAction loading={props.disabled} loadingLabel={t('companion.syncSetup.looking')} onClick={props.onTryAgain} testId="companion-sync-discover">
          {t('companion.syncSetup.connect')}
        </PrimaryAction>
      </div>
    </SyncStatusCard>
  );
}
