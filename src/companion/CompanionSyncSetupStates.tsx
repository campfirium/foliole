import { useEffect, useState } from 'react';

function PrimaryAction(props: {
  children: string;
  disabled?: boolean;
  onClick(): void;
}) {
  return (
    <button
      className="w-full rounded-2xl border border-border-strong bg-foreground px-4 py-3 text-sm font-semibold text-bg-panel transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
      disabled={props.disabled}
      onClick={props.onClick}
      type="button"
    >
      {props.children}
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
  const { isExpired, remainingMs, remainingSeconds } = useExpiryCountdown(props.expiresAt);
  const progressPct = Math.min(100, Math.max(0, (remainingMs / 45_000) * 100));
  return (
    <SyncStatusCard
      detail="Look at the desktop you're connecting to and tap Approve. We'll continue automatically as soon as you do."
      title="Asking the desktop to allow this device"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 text-sm text-foreground">
          <span aria-hidden className="relative inline-flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-foreground opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-foreground" />
          </span>
          <span>{isExpired ? 'Request expired. Tap Cancel and try again.' : `Waiting for approval... ${remainingSeconds}s left`}</span>
        </div>
        <div aria-hidden className="h-1.5 w-full overflow-hidden rounded-full bg-companion-subtle">
          <div className="h-full rounded-full bg-companion-accent transition-all duration-500 ease-linear" style={{ width: `${progressPct}%` }} />
        </div>
        <button
          className="w-full rounded-2xl border border-companion-divider px-4 py-3 text-sm font-medium text-foreground transition active:bg-companion-subtle/80"
          onClick={props.onCancel}
          type="button"
        >
          Cancel
        </button>
      </div>
    </SyncStatusCard>
  );
}

export function EmptyDiscoveryState(props: {
  disabled: boolean;
  onTryAgain(): void;
}) {
  return (
    <div className="text-center">
      <h2 className="text-xl font-semibold leading-tight text-foreground">Bring content from another device</h2>
      <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-accent">
        First open Device sync on the device that already has your content, then allow this device to connect.
      </p>
      <div className="mt-6">
        <PrimaryAction disabled={props.disabled} onClick={props.onTryAgain}>
          {props.disabled ? 'Looking...' : 'Connect another device'}
        </PrimaryAction>
      </div>
    </div>
  );
}
