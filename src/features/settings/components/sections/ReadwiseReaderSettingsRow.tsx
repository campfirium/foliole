import { SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME, SettingsControlSlot, SettingsRow, settingsButtonClassName, settingsValueBoxClassName } from '../../../../shared/ui';

export function ReadwiseReaderSettingsRow(props: {
  configured: boolean;
  onOpen?: () => void;
}) {
  return (
    <SettingsRow
      description="Manage the Readwise root folder, parser rules, and import switches from one place."
      title="Readwise Reader settings"
    >
      <SettingsControlSlot className={`${SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME} flex-col items-end gap-2`}>
        <div className={settingsValueBoxClassName()}>{props.configured ? 'Status: configured' : 'Status: needs setup'}</div>
        <button className={settingsButtonClassName()} onClick={props.onOpen} type="button">
          Open Readwise Reader settings
        </button>
      </SettingsControlSlot>
    </SettingsRow>
  );
}
