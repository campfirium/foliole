import type { SyncGroupPayload } from '../../lib/platform/syncGroupContract';
import { useTranslation } from '../shared/localization/LocalizationProvider';

export function CompanionSyncGroupRows(props: { group: SyncGroupPayload }) {
  const t = useTranslation();
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-companion-content px-4 py-3">
        <p className="text-sm text-companion-text-secondary">{t('companion.sync.group')}</p>
        <p className="mt-1 text-sm font-semibold text-foreground">{props.group.display_name}</p>
      </div>
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
    </div>
  );
}
