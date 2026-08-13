import { useCallback, useEffect, useState } from 'react';

import type { SyncGroupPayload } from '../../lib/platform/syncGroupContract';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { leaveCompanionSyncGroup } from '../shared/platform/companion/sync/syncGroupDeparture';
import {
  approveCompanionSyncGroupJoinRequest,
  loadCompanionSyncGroupProviderState,
  rejectCompanionSyncGroupJoinRequest
} from '../shared/platform/companion/sync/syncGroupProvider';
import type { CompanionSyncGroupProviderState } from '../shared/platform/companionWorkspaceSyncPluginTypes';

function useJoinRequests() {
  const [state, setState] = useState<CompanionSyncGroupProviderState | null>(null);
  const refresh = useCallback(() => {
    void loadCompanionSyncGroupProviderState().then(setState).catch(() => setState(null));
  }, []);
  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 2_000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  return { refresh, state };
}

function LeaveSyncGroup() {
  const t = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  async function leave() {
    setLeaving(true); setErrorCode(null);
    try {
      await leaveCompanionSyncGroup();
      window.location.reload();
    } catch (error) {
      setLeaving(false);
      setErrorCode(error instanceof Error ? error.message : 'sync_group_departure_failed');
    }
  }
  if (!confirming) return (
    <button className="w-full rounded-xl border border-error/60 px-3 py-2 text-sm font-semibold text-error"
      data-testid="companion-sync-group-leave" onClick={() => setConfirming(true)} type="button">
      {t('companion.sync.leave.button')}
    </button>
  );
  return (
    <div className="rounded-xl border border-error/40 px-4 py-3">
      <p className="text-sm leading-6 text-companion-text-secondary">{t('companion.sync.leave.description')}</p>
      <div className="mt-3 flex gap-2">
        <button className="flex-1 rounded-xl border border-companion-divider px-3 py-2 text-sm font-semibold"
          disabled={leaving} onClick={() => setConfirming(false)} type="button">{t('common.cancel')}</button>
        <button className="flex-1 rounded-xl border border-error/60 px-3 py-2 text-sm font-semibold text-error"
          data-testid="companion-sync-group-leave-confirm" disabled={leaving}
          onClick={() => void leave()} type="button">
          {t(leaving ? 'companion.sync.leave.progress' : 'companion.sync.leave.button')}
        </button>
      </div>
      {errorCode ? <p className="mt-3 text-sm text-error" data-error-code={errorCode}
        data-testid="companion-sync-group-leave-error">{t('companion.sync.leave.error')}</p> : null}
    </div>
  );
}

function SyncGroupDevices(props: {
  group: SyncGroupPayload;
}) {
  const t = useTranslation();
  return (
    <div className="rounded-xl bg-companion-content px-4 py-3">
      <p className="text-sm text-companion-text-secondary">{t('companion.sync.devices')}</p>
      <ul className="mt-2 space-y-2">
        {props.group.members.map((member) => (
          <li className="flex items-center justify-between gap-3 text-sm" key={member.device_id}>
            <span className="font-semibold text-foreground">{member.device_name}</span>
            <span className="text-companion-text-secondary">
              {t(member.state === 'active' ? 'companion.sync.member.active' : 'companion.sync.member.settingUp')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CompanionSyncGroupRows(props: { group: SyncGroupPayload }) {
  const t = useTranslation();
  const provider = useJoinRequests();
  const requests = provider.state?.pending_requests ?? [];
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-companion-content px-4 py-3">
        <p className="text-sm text-companion-text-secondary">{t('companion.sync.group')}</p>
        <p className="mt-1 text-sm font-semibold text-foreground">{props.group.display_name}</p>
      </div>
      <SyncGroupDevices group={props.group} />
      {requests.map((request) => (
        <div className="rounded-xl bg-companion-content px-4 py-3" key={request.pair_request_id}>
          <p className="text-sm font-semibold text-foreground">{request.device_name}</p>
          <p className="mt-1 text-sm text-companion-text-secondary">{t('companion.sync.joinRequest.description')}</p>
          <div className="mt-3 flex gap-2">
            <button className="flex-1 rounded-xl border border-companion-divider px-3 py-2 text-sm font-semibold"
              data-testid="companion-sync-group-reject"
              onClick={() => void rejectCompanionSyncGroupJoinRequest(request.pair_request_id).then(provider.refresh)} type="button">
              {t('companion.sync.joinRequest.reject')}
            </button>
            <button className="flex-1 rounded-xl bg-foreground px-3 py-2 text-sm font-semibold text-companion-content"
              data-testid="companion-sync-group-approve"
              onClick={() => void approveCompanionSyncGroupJoinRequest(request.pair_request_id).then(provider.refresh)} type="button">
              {t('companion.sync.joinRequest.approve')}
            </button>
          </div>
        </div>
      ))}
      <LeaveSyncGroup />
      <p className="px-1 text-xs leading-5 text-companion-text-secondary">
        {t('companion.sync.provider.foregroundHint')}
      </p>
    </div>
  );
}
