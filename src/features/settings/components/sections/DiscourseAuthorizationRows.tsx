import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  AppButton,
  SettingsControlSlot,
  SettingsRow,
  settingsFieldClassName
} from '../../../../shared/ui';

import type { PublishingStatus } from './usePublishingSettings';

export function DiscourseAuthorizationRows(props: {
  authorizationResult: string;
  canAuthorize: boolean;
  canComplete: boolean;
  onBegin: () => void;
  onComplete: () => void;
  onResultChange: (value: string) => void;
  status: PublishingStatus;
}) {
  const t = useTranslation();
  return (
    <>
      <SettingsRow description={t('settings.publishing.authorization.description')} title={t('settings.publishing.authorization.title')}>
        <SettingsControlSlot className="w-[min(360px,100%)]">
          <AppButton disabled={!props.canAuthorize} onClick={props.onBegin}>
            {props.status === 'authorizing' ? t('settings.publishing.authorization.opening') : t('settings.publishing.authorization.open')}
          </AppButton>
        </SettingsControlSlot>
      </SettingsRow>
      <SettingsRow description={t('settings.publishing.authorizationResult.description')} title={t('settings.publishing.authorizationResult.title')}>
        <SettingsControlSlot className="w-[min(360px,100%)]">
          <input
            aria-label={t('settings.publishing.authorizationResult.aria')}
            autoComplete="off"
            className={settingsFieldClassName()}
            disabled={props.status !== 'idle'}
            onBlur={() => {
              if (props.canComplete) props.onComplete();
            }}
            onChange={(event) => props.onResultChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && props.canComplete) event.currentTarget.blur();
            }}
            spellCheck={false}
            type="password"
            value={props.authorizationResult}
          />
        </SettingsControlSlot>
      </SettingsRow>
    </>
  );
}
