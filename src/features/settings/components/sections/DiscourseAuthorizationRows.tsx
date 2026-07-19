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
          <div className="grid w-full gap-2">
            <input
              aria-label={t('settings.publishing.authorizationResult.aria')}
              autoComplete="off"
              className={settingsFieldClassName()}
              disabled={props.status !== 'idle'}
              onChange={(event) => props.onResultChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && props.canComplete) props.onComplete();
              }}
              spellCheck={false}
              type="password"
              value={props.authorizationResult}
            />
            <div className="flex justify-end">
              <AppButton disabled={!props.canComplete} onClick={props.onComplete}>
                {props.status === 'saving' ? t('settings.publishing.authorizationResult.saving') : t('settings.publishing.authorizationResult.save')}
              </AppButton>
            </div>
          </div>
        </SettingsControlSlot>
      </SettingsRow>
    </>
  );
}
