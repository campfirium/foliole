import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsButton,
  SettingsControlSlot,
  SettingsRow
} from '../../../../shared/ui';
import type { DatabaseSpaceStatus } from '../../model/databaseCompaction';

function formatMegabytes(bytes: number) {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

export function DatabaseCompactionRow(props: {
  compact: () => void;
  isAvailable: boolean;
  isCompacting: boolean;
  status: DatabaseSpaceStatus | null;
  statusMessage: string;
}) {
  const t = useTranslation();
  const description = props.status
    ? t('settings.backups.database.description', {
        percent: props.status.reclaimablePercent.toFixed(1),
        reclaimable: formatMegabytes(props.status.reclaimableBytes),
        size: formatMegabytes(props.status.databaseSizeBytes)
      })
    : t('settings.backups.database.unavailable');
  return (
    <SettingsRow
      description={<><span className="block">{description}</span>{props.statusMessage ? <span className="block">{props.statusMessage}</span> : null}</>}
      title={t('settings.backups.database.title')}
    >
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <SettingsButton disabled={!props.isAvailable || props.isCompacting} loading={props.isCompacting} loadingLabel={t('settings.backups.database.compacting')} onClick={props.compact}>
          {t('settings.backups.database.action')}
        </SettingsButton>
      </SettingsControlSlot>
    </SettingsRow>
  );
}
