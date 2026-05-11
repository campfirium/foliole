import type {
  ReadwiseImportDestination,
  ReadwiseReaderConfig,
  ReadwiseWithoutHighlightsDestination
} from '../../../lib/core/import/readwiseReaderSettings';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSegmentedControl
} from '../../shared/ui';

const WITH_HIGHLIGHTS_OPTIONS: Array<{ label: string; value: ReadwiseImportDestination }> = [
  { label: 'Inbox', value: 'inbox' },
  { label: 'External', value: 'external' }
];

const WITHOUT_HIGHLIGHTS_OPTIONS: Array<{
  label: string;
  value: ReadwiseWithoutHighlightsDestination;
}> = [...WITH_HIGHLIGHTS_OPTIONS, { label: 'Off', value: 'off' }];

export function ReadwiseReaderImportBehavior(props: {
  config: ReadwiseReaderConfig;
  onChange: (field: keyof ReadwiseReaderConfig, value: string) => void;
}) {
  return (
    <>
      <ReadwiseBehaviorRow
        ariaLabel="With highlights destination"
        description="Source topics with parsed Readwise highlights go to this destination."
        onChange={(value) => props.onChange('withHighlightsDestination', value)}
        options={WITH_HIGHLIGHTS_OPTIONS}
        title="With highlights"
        value={props.config.withHighlightsDestination}
      />
      <ReadwiseBehaviorRow
        ariaLabel="Without highlights destination"
        description="Source topics without parsed highlights can still be imported, indexed externally, or skipped."
        onChange={(value) => props.onChange('withoutHighlightsDestination', value)}
        options={WITHOUT_HIGHLIGHTS_OPTIONS}
        title="Without highlights"
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
