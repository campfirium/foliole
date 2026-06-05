import { Settings2 } from 'lucide-react';

import { isReadwiseReaderConfigReady, type ReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppIconButton, AppStatusBadge, SettingsSection } from '../../shared/ui';

function ReadwiseSectionActions(props: {
  configured: boolean;
  onOpenConfig: () => void;
}) {
  const t = useTranslation();
  return (
    <div className="flex items-center gap-2">
      <AppStatusBadge label={props.configured ? t('desktop.readwise.section.configured') : t('desktop.readwise.section.needsSetup')} tone={props.configured ? 'success' : 'warning'} />
      <AppIconButton icon={<Settings2 aria-hidden="true" size={15} strokeWidth={1.9} />} label={t('desktop.readwise.section.openSettings')} onClick={props.onOpenConfig} />
    </div>
  );
}

export function ImportSourceWorkspaceReadwiseSection(props: {
  readwiseReaderConfig: ReadwiseReaderConfig;
  readwiseRootPath: string;
  onOpenReadwiseConfig: () => void;
}) {
  const t = useTranslation();
  const configured = props.readwiseRootPath.trim().length > 0 && isReadwiseReaderConfigReady(props.readwiseReaderConfig);

  return (
    <SettingsSection
      actions={<ReadwiseSectionActions configured={configured} onOpenConfig={props.onOpenReadwiseConfig} />}
      ariaLabel={t('desktop.readwise.section.aria')}
      className="mb-6"
      description={t('desktop.readwise.section.description')}
      title={t('desktop.readwise.section.title')}
    >
      <p className="text-sm leading-6 text-foreground/68">
        {t('desktop.readwise.section.body')}
      </p>
    </SettingsSection>
  );
}
