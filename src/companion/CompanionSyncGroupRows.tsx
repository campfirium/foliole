import { useCallback, useEffect, useState } from 'react';

import type { SyncGroupPayload } from '../../lib/platform/syncGroupContract';
import { useTranslation } from '../shared/localization/LocalizationProvider';
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
      <div className="rounded-xl bg-companion-content px-4 py-3">
        <p className="text-sm text-companion-text-secondary">{t('companion.sync.devices')}</p>
        <ul className="mt-2 space-y-2">
          {props.group.members.filter((member) => member.state !== 'left').map((member) => (
            <li className="flex items-center justify-between gap-3 text-sm" key={member.device_id}>
              <span className="font-semibold text-foreground">{member.device_name}</span>
              <span className="text-companion-text-secondary">
                {t(member.state === 'active' ? 'companion.sync.member.active' : 'companion.sync.member.settingUp')}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {requests.map((request) => (
        <div className="rounded-xl bg-companion-content px-4 py-3" key={request.pair_request_id}>
          <p className="text-sm font-semibold text-foreground">{request.device_name}</p>
          <p className="mt-1 text-sm text-companion-text-secondary">{t('companion.sync.joinRequest.description')}</p>
          <div className="mt-3 flex gap-2">
            <button className="flex-1 rounded-xl border border-companion-divider px-3 py-2 text-sm font-semibold"
              onClick={() => void rejectCompanionSyncGroupJoinRequest(request.pair_request_id).then(provider.refresh)} type="button">
              {t('companion.sync.joinRequest.reject')}
            </button>
            <button className="flex-1 rounded-xl bg-foreground px-3 py-2 text-sm font-semibold text-companion-content"
              onClick={() => void approveCompanionSyncGroupJoinRequest(request.pair_request_id).then(provider.refresh)} type="button">
              {t('companion.sync.joinRequest.approve')}
            </button>
          </div>
        </div>
      ))}
      <p className="px-1 text-xs leading-5 text-companion-text-secondary">
        {t('companion.sync.provider.foregroundHint')}
      </p>
    </div>
  );
}
