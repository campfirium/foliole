import type { ReactNode } from 'react';

import { SettingsControlSlot, SettingsRow, SettingsSection } from '../../../../shared/ui';

import { ReadwiseReaderSettingsRow } from './ReadwiseReaderSettingsRow';

type LibraryPathLocation = 'assets_dir' | 'inbox' | 'library_home' | 'mirror';

function LibraryLocationRow(props: {
  children?: ReactNode;
  description: string;
  errorMessage: string | null;
  isDesktopRuntime: boolean;
  isPending: boolean;
  onChangeLocation: (location: LibraryPathLocation) => void;
  onRestoreDefault: (location: LibraryPathLocation) => void;
  path: string;
  title: string;
  location: LibraryPathLocation;
}) {
  return (
    <SettingsRow description={props.description} title={props.title}>
      <SettingsControlSlot className="flex-col items-stretch gap-2">
        <div className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-foreground/75">
          <span className="break-all">{props.path}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-md border border-border bg-bg-panel px-3 py-1.5 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!props.isDesktopRuntime || props.isPending}
            onClick={() => props.onChangeLocation(props.location)}
            type="button"
          >
            Change location
          </button>
          <button
            className="rounded-md border border-border bg-bg-panel px-3 py-1.5 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!props.isDesktopRuntime || props.isPending}
            onClick={() => props.onRestoreDefault(props.location)}
            type="button"
          >
            Restore default
          </button>
        </div>
        {props.errorMessage ? <p className="text-sm text-red-700">{props.errorMessage}</p> : null}
        {props.children}
      </SettingsControlSlot>
    </SettingsRow>
  );
}

function MirrorRebuildControls(props: {
  isDesktopRuntime: boolean;
  isRebuildingMirrorLinks: boolean;
  isRebuildingMirrorOutput: boolean;
  mirrorLinkRebuildError: string | null;
  mirrorLinkRebuildFeedback: string | null;
  mirrorOutputRebuildError: string | null;
  mirrorOutputRebuildFeedback: string | null;
  onRebuildMirrorLinks: () => void;
  onRebuildMirrorOutput: () => void;
  pendingLocation: LibraryPathLocation | null;
}) {
  return (
    <>
      <div className="space-y-3">
        <div className="space-y-2">
          <p className="text-sm text-foreground/70">
            Daily mirror output is incremental. Startup only backfills missing article files when needed.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-md border border-border bg-bg-panel px-3 py-1.5 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!props.isDesktopRuntime || props.isRebuildingMirrorOutput || props.pendingLocation !== null}
              onClick={props.onRebuildMirrorOutput}
              type="button"
            >
              Rebuild mirror output
            </button>
          </div>
          <p className="text-sm text-foreground/60">
            Manual rebuild regenerates article `.md` files. Use it for recovery or rule changes, not for daily syncing.
          </p>
          {props.mirrorOutputRebuildFeedback ? (
            <p className="text-sm text-foreground/70">{props.mirrorOutputRebuildFeedback}</p>
          ) : null}
          {props.mirrorOutputRebuildError ? <p className="text-sm text-red-700">{props.mirrorOutputRebuildError}</p> : null}
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-md border border-border bg-bg-panel px-3 py-1.5 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!props.isDesktopRuntime || props.isRebuildingMirrorLinks || props.pendingLocation !== null}
              onClick={props.onRebuildMirrorLinks}
              type="button"
            >
              Rebuild mirror links
            </button>
          </div>
          <p className="text-sm text-foreground/60">
            Link rebuild only repairs paths inside existing mirror `.md` files after Mirror or Assets move.
          </p>
          {props.mirrorLinkRebuildFeedback ? (
            <p className="text-sm text-foreground/70">{props.mirrorLinkRebuildFeedback}</p>
          ) : null}
          {props.mirrorLinkRebuildError ? <p className="text-sm text-red-700">{props.mirrorLinkRebuildError}</p> : null}
        </div>
      </div>
    </>
  );
}

function MirrorLocationRow(props: {
  errorMessage: string | null;
  isDesktopRuntime: boolean;
  isRebuildingMirrorLinks: boolean;
  isRebuildingMirrorOutput: boolean;
  mirrorLinkRebuildError: string | null;
  mirrorLinkRebuildFeedback: string | null;
  mirrorOutputRebuildError: string | null;
  mirrorOutputRebuildFeedback: string | null;
  mirrorPath: string;
  onChangeLocation: (location: LibraryPathLocation) => void;
  onRebuildMirrorLinks: () => void;
  onRebuildMirrorOutput: () => void;
  onRestoreDefault: (location: LibraryPathLocation) => void;
  pendingLocation: LibraryPathLocation | null;
}) {
  return (
    <LibraryLocationRow
      description="Runtime-generated Markdown output. Mirror is read-only, keeps one `.md` per article, and is not a second source of truth."
      errorMessage={props.errorMessage}
      isDesktopRuntime={props.isDesktopRuntime}
      isPending={props.pendingLocation === 'mirror' || props.isRebuildingMirrorLinks || props.isRebuildingMirrorOutput}
      location="mirror"
      onChangeLocation={props.onChangeLocation}
      onRestoreDefault={props.onRestoreDefault}
      path={props.mirrorPath}
      title="Mirror"
    >
      <MirrorRebuildControls
        isDesktopRuntime={props.isDesktopRuntime}
        isRebuildingMirrorLinks={props.isRebuildingMirrorLinks}
        isRebuildingMirrorOutput={props.isRebuildingMirrorOutput}
        mirrorLinkRebuildError={props.mirrorLinkRebuildError}
        mirrorLinkRebuildFeedback={props.mirrorLinkRebuildFeedback}
        mirrorOutputRebuildError={props.mirrorOutputRebuildError}
        mirrorOutputRebuildFeedback={props.mirrorOutputRebuildFeedback}
        onRebuildMirrorLinks={props.onRebuildMirrorLinks}
        onRebuildMirrorOutput={props.onRebuildMirrorOutput}
        pendingLocation={props.pendingLocation}
      />
    </LibraryLocationRow>
  );
}

type SettingsImportSectionProps = {
  assetsPath: string;
  errorByLocation: Record<LibraryPathLocation, string | null>;
  inboxPath: string;
  isDesktopRuntime: boolean;
  isRebuildingMirrorLinks: boolean;
  isRebuildingMirrorOutput: boolean;
  libraryHomePath: string;
  mirrorLinkRebuildError: string | null;
  mirrorLinkRebuildFeedback: string | null;
  mirrorOutputRebuildError: string | null;
  mirrorOutputRebuildFeedback: string | null;
  mirrorPath: string;
  onChangeLocation: (location: LibraryPathLocation) => void;
  onRebuildMirrorLinks: () => void;
  onRebuildMirrorOutput: () => void;
  onOpenReadwiseReaderSettings?: () => void;
  onRestoreDefault: (location: LibraryPathLocation) => void;
  pendingLocation: LibraryPathLocation | null;
  readwiseReaderConfigured?: boolean;
};

function LibraryPathRows(props: SettingsImportSectionProps) {
  return (
    <>
      <LibraryLocationRow
        description="Main library root for your long-term data. Database and Data stay inside Library Home. Assets can be moved separately when you need a different attachment folder."
        errorMessage={props.errorByLocation.library_home}
        isDesktopRuntime={props.isDesktopRuntime}
        isPending={props.pendingLocation === 'library_home'}
        location="library_home"
        onChangeLocation={props.onChangeLocation}
        onRestoreDefault={props.onRestoreDefault}
        path={props.libraryHomePath}
        title="Library Home"
      />
      <LibraryLocationRow
        description="Folder for attachments and copied media. Move it when large files should live outside Library Home."
        errorMessage={props.errorByLocation.assets_dir}
        isDesktopRuntime={props.isDesktopRuntime}
        isPending={props.pendingLocation === 'assets_dir'}
        location="assets_dir"
        onChangeLocation={props.onChangeLocation}
        onRestoreDefault={props.onRestoreDefault}
        path={props.assetsPath}
        title="Assets"
      />
      <LibraryLocationRow
        description="Drop folder for incoming files. Foliole absorbs files quickly, so it should stay close to empty instead of becoming a long-term content folder."
        errorMessage={props.errorByLocation.inbox}
        isDesktopRuntime={props.isDesktopRuntime}
        isPending={props.pendingLocation === 'inbox'}
        location="inbox"
        onChangeLocation={props.onChangeLocation}
        onRestoreDefault={props.onRestoreDefault}
        path={props.inboxPath}
        title="Inbox"
      />
      {!props.isDesktopRuntime ? (
        <p className="text-sm text-foreground/60">Library folder settings are available in the desktop app.</p>
      ) : null}
      <MirrorLocationRow
        errorMessage={props.errorByLocation.mirror}
        isDesktopRuntime={props.isDesktopRuntime}
        isRebuildingMirrorLinks={props.isRebuildingMirrorLinks}
        isRebuildingMirrorOutput={props.isRebuildingMirrorOutput}
        mirrorLinkRebuildError={props.mirrorLinkRebuildError}
        mirrorLinkRebuildFeedback={props.mirrorLinkRebuildFeedback}
        mirrorOutputRebuildError={props.mirrorOutputRebuildError}
        mirrorOutputRebuildFeedback={props.mirrorOutputRebuildFeedback}
        mirrorPath={props.mirrorPath}
        onChangeLocation={props.onChangeLocation}
        onRebuildMirrorLinks={props.onRebuildMirrorLinks}
        onRebuildMirrorOutput={props.onRebuildMirrorOutput}
        onRestoreDefault={props.onRestoreDefault}
        pendingLocation={props.pendingLocation}
      />
    </>
  );
}

export function SettingsImportSection(props: SettingsImportSectionProps) {
  return (
    <div className="space-y-6">
      <SettingsSection
        ariaLabel="Library settings section"
        description="Library Home is your main root. Assets stores attachments, Inbox is the drop folder, and Mirror is a runtime-generated Markdown output folder."
        title="Library paths"
      >
        <LibraryPathRows {...props} />
      </SettingsSection>
      <SettingsSection
        ariaLabel="Import source settings section"
        description="Source-specific import parameters live here instead of inside import management."
        title="Import sources"
      >
        <ReadwiseReaderSettingsRow configured={props.readwiseReaderConfigured ?? false} onOpen={props.onOpenReadwiseReaderSettings} />
      </SettingsSection>
    </div>
  );
}
