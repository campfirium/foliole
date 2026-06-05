import type {
  ReadwiseImportDestination,
  ReadwiseReaderConfig,
  ReadwiseWithoutHighlightsDestination
} from '../../../lib/core/import/readwiseReaderSettings';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSegmentedControl
} from '../../shared/ui';

type Translate = ReturnType<typeof useTranslation>;

function getWithHighlightsOptions(t: Translate): Array<{ label: string; value: ReadwiseImportDestination }> {
  return [
    { label: t('desktop.readwise.destination.inbox'), value: 'inbox' },
    { label: t('desktop.readwise.destination.external'), value: 'external' }
  ];
}

function getWithoutHighlightsOptions(t: Translate): Array<{
  label: string;
  value: ReadwiseWithoutHighlightsDestination;
}> {
  return [...getWithHighlightsOptions(t), { label: t('desktop.readwise.destination.off'), value: 'off' }];
}

export function ReadwiseReaderImportBehavior(props: {
  config: ReadwiseReaderConfig;
  onChange: (field: keyof ReadwiseReaderConfig, value: string) => void;
}) {
  const t = useTranslation();

  return (
    <>
      <ReadwiseBehaviorRow
        ariaLabel={t('desktop.readwise.behavior.withHighlights.aria')}
        description={t('desktop.readwise.behavior.withHighlights.description')}
        onChange={(value) => props.onChange('withHighlightsDestination', value)}
        options={getWithHighlightsOptions(t)}
        title={t('desktop.readwise.behavior.withHighlights.title')}
        value={props.config.withHighlightsDestination}
      />
      <ReadwiseBehaviorRow
        ariaLabel={t('desktop.readwise.behavior.withoutHighlights.aria')}
        description={t('desktop.readwise.behavior.withoutHighlights.description')}
        onChange={(value) => props.onChange('withoutHighlightsDestination', value)}
        options={getWithoutHighlightsOptions(t)}
        title={t('desktop.readwise.behavior.withoutHighlights.title')}
        value={props.config.withoutHighlightsDestination}
      />
    </>
  );
}

function ReadwiseBehaviorRow(props: {
  ariaLabel: string;
  description: string;
  onChange: (value: ReadwiseImportDestination | ReadwiseWithoutHighlightsDestination) => void;
  options: Array<{
    label: string;
    value: ReadwiseImportDestination | ReadwiseWithoutHighlightsDestination;
  }>;
  title: string;
  value: ReadwiseImportDestination | ReadwiseWithoutHighlightsDestination;
}) {
  return (
    <SettingsRow description={props.description} title={props.title}>
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <SettingsSegmentedControl
          ariaLabel={props.ariaLabel}
          onChange={(value) =>
            props.onChange(
              value as ReadwiseImportDestination | ReadwiseWithoutHighlightsDestination
            )
          }
          options={props.options}
          value={props.value}
        />
      </SettingsControlSlot>
    </SettingsRow>
  );
}
