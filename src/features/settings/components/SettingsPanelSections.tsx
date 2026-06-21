import type { ReactNode } from 'react';

import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import type { TranslationKey } from '../../../shared/localization/translations';
import type {
  ExternalSourceSettingsFolder,
  ExternalSourceSettingsFolderPatch
} from '../../../shared/platform/externalSourceSettingsRepository';
import type { HotkeySettingItem, HotkeyUpdateResult } from '../model/hotkeySettings';
import {
  type SettingsCategoryId
} from '../model/settingsPanelOptions';

import { HotkeySettingsSection } from './HotkeySettingsSection';
import { SettingsAboutSection } from './sections/SettingsAboutSection';
import { SettingsAppearanceSection } from './sections/SettingsAppearanceSection';
import { SettingsBackupsSection } from './sections/SettingsBackupsSection';
import { SettingsCompanionSyncSection } from './sections/SettingsCompanionSyncSection';
import { SettingsEditorSection } from './sections/SettingsEditorSection';
import { SettingsExternalSearchSection } from './sections/SettingsExternalSearchSection';
import { SettingsGeneralSection } from './sections/SettingsGeneralSection';
import { SettingsImportSection } from './sections/SettingsImportSection';
import { SettingsMouseGesturesSection } from './sections/SettingsMouseGesturesSection';
import { SettingsRailSection } from './sections/SettingsRailSection';
import { SettingsReviewSection } from './sections/SettingsReviewSection';
import { SettingsWebLookupSection } from './sections/SettingsWebLookupSection';

import { definedProps } from '@/shared/lib/definedProps';

export interface SettingsCategoryContentProps {
  activeCategory: SettingsCategoryId;
  assetsPath: string;
  errorByLocation: Record<'assets_dir' | 'inbox' | 'library_home' | 'mirror', string | null>;
  externalSearchError: string | null;
  externalSearchFeedback: string | null;
  externalSearchFolders: ExternalSourceSettingsFolder[];
  hideLanguageSetting?: boolean;
  hotkeyItems: HotkeySettingItem[];
  inboxPath: string;
  isDesktopRuntime: boolean;
  isLoadingLibraryPaths: boolean;
  isRebuildingMirrorLinks: boolean;
  isRebuildingMirrorOutput: boolean;
  isLoadingExternalSearchFolders: boolean;
  isSavingExternalSearchFolders: boolean;
  libraryHomePath: string;
  mirrorLinkRebuildError: string | null;
  mirrorLinkRebuildFeedback: string | null;
  mirrorOutputRebuildError: string | null;
  mirrorOutputRebuildFeedback: string | null;
  mirrorPath: string;
  importCategoryContent?: ReactNode;
  onChangeLocation: (location: 'assets_dir' | 'inbox' | 'library_home' | 'mirror') => void;
  onAddExternalSearchFolder: () => void;
  onChooseExternalAttachmentRoot: (folderId: string) => void;
  onChooseExternalSearchFolder: (folderId: string) => void;
  onRebuildExternalSearchIndex: (folderId?: string) => void;
  onRemoveExternalSearchFolder: (folderId: string) => void;
  onRetryLoadExternalSearchFolders: () => void;
  onRebuildMirrorLinks: () => void;
  onRebuildMirrorOutput: () => void;
  onRestoreDefault: (location: 'assets_dir' | 'inbox' | 'library_home' | 'mirror') => void;
  onUpdateExternalSearchFolder: (folderId: string, patch: ExternalSourceSettingsFolderPatch) => void;
  pendingLocation: 'assets_dir' | 'inbox' | 'library_home' | 'mirror' | null;
  previewDesktopSettings?: boolean;
  readwiseReaderCategoryContent?: ReactNode;
  onHotkeyReset: (commandId: string) => void;
  onHotkeyResetAll: () => void;
  onHotkeyUpdate: (commandId: string, slot: 'primary' | 'secondary', nextLabel: string) => HotkeyUpdateResult;
  onRunSupportCommand?: ((commandId: string) => void) | undefined;
  onEnterPreview: () => void;
  onSettingsBackdropTransparentChange: (value: boolean) => void;
}

function ReviewSettingsContent() {
  return <SettingsReviewSection />;
}

function renderLibraryCategory(props: SettingsCategoryContentProps) {
  return (
    <SettingsImportSection
      assetsPath={props.assetsPath}
      errorByLocation={props.errorByLocation}
      inboxPath={props.inboxPath}
      isDesktopRuntime={props.isDesktopRuntime}
      isLoadingLibraryPaths={props.isLoadingLibraryPaths}
      isRebuildingMirrorLinks={props.isRebuildingMirrorLinks}
      isRebuildingMirrorOutput={props.isRebuildingMirrorOutput}
      libraryHomePath={props.libraryHomePath}
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
  );
}

function renderExternalSearchCategory(props: SettingsCategoryContentProps) {
  return (
    <SettingsExternalSearchSection
      error={props.externalSearchError}
      feedback={props.externalSearchFeedback}
      folders={props.externalSearchFolders}
      isDesktopRuntime={props.isDesktopRuntime}
      {...definedProps({ previewDesktopSettings: props.previewDesktopSettings })}
      isLoading={props.isLoadingExternalSearchFolders}
      isSaving={props.isSavingExternalSearchFolders}
      onAddFolder={props.onAddExternalSearchFolder}
      onChooseAttachmentRoot={props.onChooseExternalAttachmentRoot}
      onChooseFolder={props.onChooseExternalSearchFolder}
      onRebuildIndex={props.onRebuildExternalSearchIndex}
      onRemoveFolder={props.onRemoveExternalSearchFolder}
      onRetryLoad={props.onRetryLoadExternalSearchFolders}
      onUpdateFolder={props.onUpdateExternalSearchFolder}
    />
  );
}

type LocalizedSettingsCategoryContentProps = SettingsCategoryContentProps & {
  t: (key: TranslationKey) => string;
};

function renderFallbackCategory(props: LocalizedSettingsCategoryContentProps) {
  const t = props.t;
  if (props.activeCategory === 'import') {
    return props.importCategoryContent ?? <p className="text-sm text-foreground/65">{t('settings.fallback.import')}</p>;
  }
  if (props.activeCategory === 'readwise-reader') {
    return props.readwiseReaderCategoryContent ?? (
      <p className="text-sm text-foreground/65">{t('settings.fallback.readwiseReader')}</p>
    );
  }
  if (props.activeCategory === 'review') {
    return <ReviewSettingsContent />;
  }
  if (props.activeCategory === 'backups') {
    return <SettingsBackupsSection />;
  }
  if (props.activeCategory === 'about') {
    return <SettingsAboutSection onRunSupportCommand={props.onRunSupportCommand} />;
  }
  if (props.activeCategory === 'companion-sync') {
    return <SettingsCompanionSyncSection />;
  }
  return (
    <HotkeySettingsSection
      items={props.hotkeyItems}
      onReset={props.onHotkeyReset}
      onResetAll={props.onHotkeyResetAll}
      onUpdate={props.onHotkeyUpdate}
    />
  );
}

export function SettingsCategoryContent(props: SettingsCategoryContentProps) {
  const t = useTranslation();
  const localizedProps = { ...props, t };
  switch (props.activeCategory) {
    case 'editor':
      return <SettingsEditorSection />;
    case 'general':
      return (
        <SettingsGeneralSection
          {...definedProps({
            hideLanguageSetting: props.hideLanguageSetting,
            previewDesktopSettings: props.previewDesktopSettings
          })}
        />
      );
    case 'web-lookup':
      return <SettingsWebLookupSection />;
    case 'appearance':
      return <SettingsAppearanceSection onEnterPreview={props.onEnterPreview} onSettingsBackdropTransparentChange={props.onSettingsBackdropTransparentChange} />;
    case 'rail':
      return <SettingsRailSection actionItems={props.hotkeyItems} />;
    case 'mouse-gestures':
      return <SettingsMouseGesturesSection />;
    case 'library':
      return renderLibraryCategory(props);
    case 'external-search':
      return renderExternalSearchCategory(props);
    default:
      return renderFallbackCategory(localizedProps);
  }
}
