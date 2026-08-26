import { useCallback, useEffect, useState } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import {
  acceptCompanionSyncGroupJoinRequest,
  loadCompanionSyncGroupProviderState,
  rejectCompanionSyncGroupJoinRequest,
  subscribeCompanionSyncGroupProviderState
} from '../shared/platform/companion/sync/syncGroupProvider';
import type { CompanionSyncGroupProviderState } from '../shared/platform/companionWorkspaceSyncPluginTypes';

export function useSyncGroupProviderState(enabled = true) {
  const [state, setState] = useState<CompanionSyncGroupProviderState | null>(null);
  const refresh = useCallback(() => {
    void loadCompanionSyncGroupProviderState().then(setState).catch(() => setState(null));
  }, []);
  useEffect(() => {
    if (!enabled) return undefined;
    let disposed = false;
    let unsubscribe: () => void = () => undefined;
    void subscribeCompanionSyncGroupProviderState(setState).then((remove) => {
      if (disposed) remove();
      else { unsubscribe = remove; refresh(); }
    }).catch(refresh);
    return () => { disposed = true; unsubscribe(); };
  }, [enabled, refresh]);
  return { refresh, setState, state };
}

const PLATFORM_LABELS: Record<string, string> = {
  android: 'Android', darwin: 'macOS', ios: 'iOS', linux: 'Linux', win32: 'Windows'
};

function platformFor(kind: string) {
  const key = Object.keys(PLATFORM_LABELS).find((candidate) => kind.toLowerCase().includes(candidate));
  return key ? PLATFORM_LABELS[key]! : kind;
}

function PendingJoinRequest(props: {
  onState(next: CompanionSyncGroupProviderState): void;
  request: CompanionSyncGroupProviderState['pending_requests'][number];
}) {
  const t = useTranslation();
  const [resolving, setResolving] = useState(false);
  const [failed, setFailed] = useState(false);
  async function resolve(accept: boolean) {
    setResolving(true); setFailed(false);
    try {
      const action = accept
        ? acceptCompanionSyncGroupJoinRequest
        : rejectCompanionSyncGroupJoinRequest;
      props.onState(await action(props.request.request_id));
    } catch {
      setFailed(true);
    } finally {
      setResolving(false);
    }
  }
  return (
    <div className="border-t border-companion-divider py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm font-semibold text-foreground">{props.request.device_name}</span>
        <span className="shrink-0 text-xs text-companion-text-tertiary">
          {platformFor(props.request.platform)}
        </span>
      </div>
      <p className="mt-1 text-sm leading-6 text-companion-text-secondary">
        {t('companion.sync.joinRequest.description')}
      </p>
      <div className="mt-3 flex gap-2">
        <button className="min-h-11 flex-1 touch-manipulation rounded-md border border-companion-divider px-3 py-2 text-sm font-semibold disabled:opacity-45"
          data-testid="companion-sync-group-reject" disabled={resolving}
          onClick={() => void resolve(false)} type="button">
          {t('companion.sync.joinRequest.reject')}
        </button>
        <button className="min-h-11 flex-1 touch-manipulation rounded-md border border-companion-accent px-3 py-2 text-sm font-semibold text-companion-accent disabled:opacity-45"
          data-testid="companion-sync-group-approve" disabled={resolving}
          onClick={() => void resolve(true)} type="button">
          {t('companion.sync.joinRequest.approve')}
        </button>
      </div>
      {failed ? <p className="mt-3 text-sm text-error" role="alert">
        {t('companion.sync.joinRequest.error')}
      </p> : null}
    </div>
  );
}

export function CompanionSyncGroupJoinApproval(props: {
  provider: ReturnType<typeof useSyncGroupProviderState>;
}) {
  const request = props.provider.state?.pending_requests[0];
  return request
    ? <PendingJoinRequest onState={props.provider.setState} request={request} />
    : null;
}
