import type { ReactNode } from 'react';

import {
  ObjectConfigPathControl,
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsLoadingState,
  SettingsRow,
  SettingsSection,
  settingsButtonClassName
} from '../../../../shared/ui';
import {
  settingsSearchRowProps,
  type SettingsSearchRowMeta
} from '../../model/settingsSearch';
import { LIBRARY_SETTINGS_SEARCH_ROWS } from '../../model/settingsSearchRowCatalog';

import type { LibraryPathLocation, SettingsImportSectionProps } from './settingsImportSectionTypes';

const LIBRARY_ROW = {
  assets: LIBRARY_SETTINGS_SEARCH_ROWS[1]!,
  inbox: LIBRARY_SETTINGS_SEARCH_ROWS[2]!,
  libraryHome: LIBRARY_SETTINGS_SEARCH_ROWS[0]!,
  mirror: LIBRARY_SETTINGS_SEARCH_ROWS[3]!,
  mirrorLinks: LIBRARY_SETTINGS_SEARCH_ROWS[5]!,
  mirrorOutput: LIBRARY_SETTINGS_SEARCH_ROWS[4]!
};

function LibraryLocationRow(props: {
  children?: ReactNode;
  description: string;
  errorMessage: string | null;
  isDesktopRuntime: boolean;
  isPending: boolean;
  onChangeLocation: (location: LibraryPathLocation) => void;
  onRestoreDefault: (location: LibraryPathLocation) => void;
  path: string;
  searchRow: SettingsSearchRowMeta;
  title: string;
  location: LibraryPathLocation;
}) {
  return (
    <SettingsRow {...settingsSearchRowProps(props.searchRow)} description={props.description} title={props.title}>
      <SettingsControlSlot className={`${SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME} flex-col items-end gap-2`}>
        <ObjectConfigPathControl
          disabled={!props.isDesktopRuntime || props.isPending}
          emptyLabel={props.title}
          label="Change location"
          onClick={() => props.onChangeLocation(props.location)}
          onRestoreDefault={() => props.onRestoreDefault(props.location)}
          path={props.path}
        />
        {props.errorMessage ? <p className="text-sm text-error" role="alert">{props.errorMessage}</p> : null}
        {props.children}
      </SettingsControlSlot>
    </SettingsRow>
  );
}

function MirrorActionRow(props: {
  ariaLabel: string;
  description: ReactNode;
  disabled: boolean;
  error: string | null;
  feedback: string | null;
  onClick: () => void;
  title: string;
}) {
  const description = (
    <>
      <span className="block">{props.description}</span>
      {props.feedback ? <span className="mt-1 block text-foreground/70">{props.feedback}</span> : null}
      {props.error ? <span className="mt-1 block text-error" role="alert">{props.error}</span> : null}
    </>
  );

  return (
    <SettingsRow
      {...settingsSearchRowProps(props.title === LIBRARY_ROW.mirrorOutput.title ? LIBRARY_ROW.mirrorOutput : LIBRARY_ROW.mirrorLinks)}
      description={description}
      title={props.title}
    >
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <button
          aria-label={props.ariaLabel}
          className={settingsButtonClassName()}
          disabled={props.disabled}
          onClick={props.onClick}
          type="button"
        >
          Rebuild
        </button>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

function MirrorLocationRow(props: {
  errorMessage: string | null;
  isDesktopRuntime: boolean;
  isRebuildingMirrorLinks: boolean;
  isRebuildingMirrorOutput: boolean;
  mirrorPath: string;
  onChangeLocation: (location: LibraryPathLocation) => void;
  onRestoreDefault: (location: LibraryPathLocation) => void;
  pendingLocation: LibraryPathLocation | null;
}) {
  const isMirrorBusy = props.pendingLocation === 'mirror' || props.isRebuildingMirrorLinks || props.isRebuildingMirrorOutput;
  return (
    <LibraryLocationRow
      description="A read-only Markdown export Foliole regenerates automatically — one .md file per topic. Edits made here are not read back."
      errorMessage={props.errorMessage}
      isDesktopRuntime={props.isDesktopRuntime}
      isPending={isMirrorBusy}
      location="mirror"
      onChangeLocation={props.onChangeLocation}
      onRestoreDefault={props.onRestoreDefault}
      path={props.mirrorPath}
      searchRow={LIBRARY_ROW.mirror}
      title="Mirror"
    />
  );
}

function MirrorMaintenanceSection(props: SettingsImportSectionProps) {
  return (
    <SettingsSection ariaLabel="Mirror maintenance section" title="Mirror maintenance">
      <MirrorActionRow
        ariaLabel="Rebuild mirror output"
        description="Daily output is incremental and normally needs no adjustment. Rebuild only for recovery or rule changes."
        disabled={!props.isDesktopRuntime || props.isRebuildingMirrorOutput || props.pendingLocation !== null}
        error={props.mirrorOutputRebuildError}
      feedback={props.mirrorOutputRebuildFeedback}
      onClick={props.onRebuildMirrorOutput}
      title={LIBRARY_ROW.mirrorOutput.title}
      />
      <MirrorActionRow
        ariaLabel="Rebuild mirror links"
        description="Normally needs no adjustment. Rebuild links only after moving Mirror or Assets folders."
        disabled={!props.isDesktopRuntime || props.isRebuildingMirrorLinks || props.pendingLocation !== null}
        error={props.mirrorLinkRebuildError}
      feedback={props.mirrorLinkRebuildFeedback}
      onClick={props.onRebuildMirrorLinks}
      title={LIBRARY_ROW.mirrorLinks.title}
      />
    </SettingsSection>
  );
}

function LibraryPathLoadingRows() {
  return <SettingsLoadingState />;
}

function LibraryPathRows(props: SettingsImportSectionProps) {
  if (props.isLoadingLibraryPaths) {
    return <LibraryPathLoadingRows />;
  }

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
        searchRow={LIBRARY_ROW.libraryHome}
        title={LIBRARY_ROW.libraryHome.title}
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
        searchRow={LIBRARY_ROW.assets}
        title={LIBRARY_ROW.assets.title}
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
        searchRow={LIBRARY_ROW.inbox}
        title={LIBRARY_ROW.inbox.title}
      />
      {!props.isDesktopRuntime ? (
        <p className="text-sm text-foreground/60">Library folder settings are available in the desktop app.</p>
      ) : null}
      <MirrorLocationRow
        errorMessage={props.errorByLocation.mirror}
        isDesktopRuntime={props.isDesktopRuntime}
        isRebuildingMirrorLinks={props.isRebuildingMirrorLinks}
        isRebuildingMirrorOutput={props.isRebuildingMirrorOutput}
        mirrorPath={props.mirrorPath}
        onChangeLocation={props.onChangeLocation}
        onRestoreDefault={props.onRestoreDefault}
        pendingLocation={props.pendingLocation}
      />
    </>
  );
}

export function SettingsImportSection(props: SettingsImportSectionProps) {
  return (
    <>
      <SettingsSection
        ariaLabel="Library settings section"
        title="Library"
      >
        <LibraryPathRows {...props} />
      </SettingsSection>
      <MirrorMaintenanceSection {...props} />
    </>
  );
}
