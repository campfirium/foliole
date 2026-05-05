import { AppButton, SettingsControlSlot, SettingsRow } from '../../../../shared/ui';

export function ReadwiseReaderSettingsRow(props: {
  configured: boolean;
  onOpen?: () => void;
}) {
  return (
    <SettingsRow
      description="Manage the Readwise root folder, parser rules, and import switches from one place."
      title="Readwise Reader settings"
    >
      <SettingsControlSlot className="flex-col items-stretch gap-2">
        <div className="text-sm text-foreground/65">{props.configured ? 'Status: configured' : 'Status: needs setup'}</div>
        <AppButton className="self-start" onClick={props.onOpen} variant="subtle">
          Open Readwise Reader settings
        </AppButton>
      </SettingsControlSlot>
    </SettingsRow>
  );
}
