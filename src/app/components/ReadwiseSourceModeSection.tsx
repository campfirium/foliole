import type { ReadwiseSourceMode } from '../../../lib/core/import/importManagerSettings';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { SettingsSection, SettingsSegmentedRow } from '../../shared/ui';

import { ReadwiseApiModeSettingsRows, type ReadwiseApiModeSettings } from './ReadwiseApiModeSettingsRows';
import { useReadwiseSourceMigration } from './useReadwiseSourceMigration';

interface ReadwiseSourceModeSectionProps {
  apiSettings?: ReadwiseApiModeSettings;
  committedMode?: ReadwiseSourceMode;
  mode: ReadwiseSourceMode;
  onChange: (mode: ReadwiseSourceMode) => void;
  onConnected?: () => void;
  onCommitMode?: (mode: ReadwiseSourceMode) => void;
}

export function ReadwiseSourceModeSection(props: ReadwiseSourceModeSectionProps) {
  const t = useTranslation();
  const committedMode = props.committedMode ?? props.mode;
  const migration = useReadwiseSourceMigration({
    committedMode,
    ...(props.onCommitMode ? { onCommitMode: props.onCommitMode } : {}),
    onSelectApi: () => props.onChange('api'),
    t
  });

  async function chooseMode(mode: ReadwiseSourceMode) {
    if (mode !== 'api' || committedMode === 'api') {
      props.onChange(mode);
      props.onCommitMode?.(mode);
      return;
    }
    await migration.selectApi();
  }

  const migrating = committedMode !== 'api' && props.mode === 'api';
  return (
    <SettingsSection ariaLabel={t('desktop.readwise.source.title')}>
      <SettingsSegmentedRow
        ariaLabel={t('desktop.readwise.source.mode.aria')}
        controlAlignment="description"
        description={(
          <>
            {t('desktop.readwise.source.mode.description')}
            <span className="mt-4 block">{t('desktop.readwise.source.description')}</span>
          </>
        )}
        disabled={committedMode === 'api'}
        label={t('desktop.readwise.source.mode.title')}
        onChange={(value) => void chooseMode(value as ReadwiseSourceMode)}
        options={[
          { label: t('desktop.readwise.source.mode.off'), value: 'off' },
          { label: t('desktop.readwise.source.mode.folder'), value: 'folder' },
          { label: t('desktop.readwise.source.mode.api'), value: 'api' }
        ]}
        value={props.mode}
      />
      {props.mode === 'api' && props.apiSettings ? (
        <ReadwiseApiModeSettingsRows
          migrationActive={migration.required}
          migrationMode={migrating}
          migrationPending={migration.pending}
          onConnected={() => {
            props.onConnected?.();
            if (migrating || migration.required) void migration.start();
          }}
          migrationPercent={migration.percent}
          settings={props.apiSettings}
        />
      ) : null}
    </SettingsSection>
  );
}
