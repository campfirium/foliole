import { SettingsControlSlot, SettingsRow, SettingsSection } from '../../../../shared/ui';

export function SettingsImportSection(props: {
  errorMessage: string | null;
  inboxPath: string;
  isDesktopRuntime: boolean;
  isPending: boolean;
  onChangeLocation: () => void;
  onRestoreDefault: () => void;
}) {
  return (
    <SettingsSection
      ariaLabel="Import settings section"
      description="Foliole watches one Inbox folder automatically. Supported files are imported into the Inbox node as soon as they appear."
      title="Inbox folder"
    >
      <SettingsRow
        description="This folder is watched on startup and while the app is running. Imported `.md` and `.txt` files are moved to the system Trash after success."
        title="Folder location"
      >
        <SettingsControlSlot className="flex-col items-stretch gap-2">
          <div className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-foreground">
            <span className="break-all">{props.inboxPath}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-md border border-border bg-bg-panel px-3 py-1.5 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!props.isDesktopRuntime || props.isPending}
              onClick={props.onChangeLocation}
              type="button"
            >
              Change location
            </button>
            <button
              className="rounded-md border border-border bg-bg-panel px-3 py-1.5 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!props.isDesktopRuntime || props.isPending}
              onClick={props.onRestoreDefault}
              type="button"
            >
              Restore default
            </button>
          </div>
          {props.errorMessage ? <p className="text-sm text-red-700">{props.errorMessage}</p> : null}
          {!props.isDesktopRuntime ? (
            <p className="text-sm text-foreground/60">Inbox folder settings are available in the desktop app.</p>
          ) : null}
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}
