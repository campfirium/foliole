import type { ReactNode } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  ObjectConfigPathControl,
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsLoadingState,
  SettingsRow
} from '../../../../shared/ui';
import {
  settingsSearchRowProps,
  type SettingsSearchRowMeta
} from '../../model/settingsSearch';
import { createSettingsSearchRows } from '../../model/settingsSearchRowCatalog';

import type { LibraryPathLocation, SettingsImportSectionProps } from './settingsImportSectionTypes';

export function getLibraryRows(t: ReturnType<typeof useTranslation>) {
  const rows = createSettingsSearchRows(t).filter((row) => row.categoryId === 'library');
  return {
    assets: rows[1]!,
    inbox: rows[2]!,
    libraryHome: rows[0]!,
    mirror: rows[3]!,
    mirrorLinks: rows[5]!,
    mirrorOutput: rows[4]!
  };
}

function LibraryLocationRow(props: {
  children?: ReactNode;
  description: string;
  errorMessage: string | null;
  isDesktopRuntime: boolean;
  isPending: boolean;
  location: LibraryPathLocation;
  onChangeLocation: (location: LibraryPathLocation) => void;
  onRestoreDefault: (location: LibraryPathLocation) => void;
  path: string;
  searchRow: SettingsSearchRowMeta;
  title: string;
}) {
  const t = useTranslation();

  return (
    <SettingsRow {...settingsSearchRowProps(props.searchRow)} description={props.description} title={props.title}>
      <SettingsControlSlot className={`${SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME} flex-col items-end gap-2`}>
        <ObjectConfigPathControl
          disabled={!props.isDesktopRuntime || props.isPending}
          emptyLabel={props.title}
          label={t('settings.library.changeLocation')}
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

function MirrorLocationRow(props: {
  errorMessage: string | null;
  isDesktopRuntime: boolean;
  isRebuildingMirrorLinks: boolean;
  isRebuildingMirrorOutput: boolean;
  mirrorPath: string;
  onChangeLocation: (location: LibraryPathLocation) => void;
  onRestoreDefault: (location: LibraryPathLocation) => void;
  pendingLocation: LibraryPathLocation | null;
  searchRow: SettingsSearchRowMeta;
}) {
  const t = useTranslation();
  const isMirrorBusy = props.pendingLocation === 'mirror' || props.isRebuildingMirrorLinks || props.isRebuildingMirrorOutput;
  return (
    <LibraryLocationRow
      description={t('settings.library.mirror.description')}
      errorMessage={props.errorMessage}
      isDesktopRuntime={props.isDesktopRuntime}
      isPending={isMirrorBusy}
      location="mirror"
      onChangeLocation={props.onChangeLocation}
      onRestoreDefault={props.onRestoreDefault}
      path={props.mirrorPath}
      searchRow={props.searchRow}
      title={props.searchRow.title}
    />
  );
}

function LibraryPathLoadingRows() {
  return <SettingsLoadingState />;
}

function LibraryAvailablePathRows(props: SettingsImportSectionProps) {
  const t = useTranslation();
  const libraryRow = getLibraryRows(t);

  return (
    <>
      <LibraryLocationRow
        description={t('settings.library.home.description')}
        errorMessage={props.errorByLocation.library_home}
        isDesktopRuntime={props.isDesktopRuntime}
        isPending={props.pendingLocation === 'library_home'}
        location="library_home"
        onChangeLocation={props.onChangeLocation}
        onRestoreDefault={props.onRestoreDefault}
        path={props.libraryHomePath}
        searchRow={libraryRow.libraryHome}
        title={libraryRow.libraryHome.title}
      />
      <LibraryLocationRow
        description={t('settings.library.assets.description')}
        errorMessage={props.errorByLocation.assets_dir}
        isDesktopRuntime={props.isDesktopRuntime}
        isPending={props.pendingLocation === 'assets_dir'}
        location="assets_dir"
        onChangeLocation={props.onChangeLocation}
        onRestoreDefault={props.onRestoreDefault}
        path={props.assetsPath}
        searchRow={libraryRow.assets}
        title={libraryRow.assets.title}
      />
      <LibraryLocationRow
        description={t('settings.library.inbox.description')}
        errorMessage={props.errorByLocation.inbox}
        isDesktopRuntime={props.isDesktopRuntime}
        isPending={props.pendingLocation === 'inbox'}
        location="inbox"
        onChangeLocation={props.onChangeLocation}
        onRestoreDefault={props.onRestoreDefault}
        path={props.inboxPath}
        searchRow={libraryRow.inbox}
        title={libraryRow.inbox.title}
      />
      {!props.isDesktopRuntime ? (
        <p className="text-sm text-foreground/60">{t('settings.library.desktopRequired')}</p>
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
        searchRow={libraryRow.mirror}
      />
    </>
  );
}

export function LibraryPathRows(props: SettingsImportSectionProps) {
  if (props.isLoadingLibraryPaths) {
    return <LibraryPathLoadingRows />;
  }
  return <LibraryAvailablePathRows {...props} />;
}
