import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  settingsFieldClassName
} from '../../../../shared/ui';

import { PublishingSetupStep } from './PublishingSetupStep';
import type { PublishingStatus } from './usePublishingSettings';

export function DiscourseAuthorizationRows(props: {
  authorizationResult: string;
  canAuthorize: boolean;
  connected: boolean;
  onBegin: () => void;
  onResultChange: (value: string) => void;
  status: PublishingStatus;
}) {
  const t = useTranslation();
  return (
    <PublishingSetupStep
      description={<><button className="font-medium text-foreground underline underline-offset-4 disabled:opacity-50" disabled={!props.canAuthorize} onClick={props.onBegin} type="button">{t(props.status === 'authorizing' ? 'settings.publishing.authorization.opening' : 'settings.publishing.authorization.open')}</button>{t('settings.publishing.authorization.descriptionSuffix')}</>}
      title={t('settings.publishing.authorization.title')}
    >
      <input
        aria-label={t('settings.publishing.authorizationResult.aria')}
        autoComplete="off"
        className={settingsFieldClassName()}
        disabled={props.connected || props.status !== 'idle'}
        name="discourse-publish-authorization-key"
        onChange={(event) => props.onResultChange(event.target.value)}
        spellCheck={false}
        type="password"
        value={props.authorizationResult}
      />
    </PublishingSetupStep>
  );
}
