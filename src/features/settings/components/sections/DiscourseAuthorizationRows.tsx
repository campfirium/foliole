import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  AppSpinner,
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
      description={<><button aria-busy={props.status === 'authorizing' || undefined} className={`inline-flex items-center gap-2 font-medium text-foreground underline underline-offset-4 disabled:pointer-events-none ${props.status === 'authorizing' ? 'disabled:opacity-100' : 'disabled:opacity-50'}`} disabled={!props.canAuthorize || props.status === 'authorizing'} onClick={props.onBegin} type="button">{props.status === 'authorizing' ? <AppSpinner className="pointer-events-none shrink-0" decorative size="sm" /> : null}<span>{t(props.status === 'authorizing' ? 'settings.publishing.authorization.opening' : 'settings.publishing.authorization.open')}</span></button>{t('settings.publishing.authorization.descriptionSuffix')}</>}
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
