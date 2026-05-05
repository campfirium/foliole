import type { ReactNode } from 'react';

import type { RuntimeExternalSearchFolder } from '../../../shared/platform/externalSearchBridge';
import type { HotkeySettingItem, HotkeyUpdateResult } from '../model/hotkeySettings';
import { SETTINGS_CATEGORIES, type SettingsCategoryId } from '../model/settingsPanelOptions';

import { HotkeySettingsSection } from './HotkeySettingsSection';
import { SettingsAboutSection } from './sections/SettingsAboutSection';
import { SettingsAppearanceSection } from './sections/SettingsAppearanceSection';
import { SettingsBackupsSection } from './sections/SettingsBackupsSection';
import { SettingsEditorSection } from './sections/SettingsEditorSection';
import { SettingsExternalSearchSection } from './sections/SettingsExternalSearchSection';
import { SettingsImportSection } from './sections/SettingsImportSection';
import { SettingsMouseGesturesSection } from './sections/SettingsMouseGesturesSection';
import { SettingsReviewSection } from './sections/SettingsReviewSection';

import { cn } from '@/shared/lib/utils';
import { AppButton, AppPanel } from '@/shared/ui';

export interface SettingsCategoryContentProps {
  activeCategory: SettingsCategoryId;
  assetsPath: string;
  errorByLocation: Record<'assets_dir' | 'inbox' | 'library_home' | 'mirror', string | null>;
  externalSearchError: string | null;
  externalSearchFeedback: string | null;
  externalSearchFolders: RuntimeExternalSearchFolder[];
  hotkeyItems: HotkeySettingItem[];
  inboxPath: string;
  isDesktopRuntime: boolean;
  isRebuildingMirrorLinks: boolean;
  isRebuildingMirrorOutput: boolean;
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
  onRebuildMirrorLinks: () => void;
  onRebuildMirrorOutput: () => void;
  onRestoreDefault: (location: 'assets_dir' | 'inbox' | 'library_home' | 'mirror') => void;
  onUpdateExternalSearchFolder: (
    folderId: string,
    patch: Partial<Pick<RuntimeExternalSearchFolder, 'attachmentRootPath' | 'excludedDirs' | 'folderPath'>>
  ) => void;
  pendingLocation: 'assets_dir' | 'inbox' | 'library_home' | 'mirror' | null;
  readwiseReaderCategoryContent?: ReactNode;
  onHotkeyReset: (commandId: string) => void;
  onHotkeyResetAll: () => void;
  onHotkeyUpdate: (commandId: string, slot: 'primary' | 'secondary', nextLabel: string) => HotkeyUpdateResult;
}

export function SettingsSidebar(props: {
  activeCategory: SettingsCategoryId;
  setActiveCategory: (category: SettingsCategoryId) => void;
}) {
  return (
    <AppPanel
      as="aside"
      ariaLabel="Settings categories"
      bodyClassName="px-4 pb-5"
      headerClassName="px-9 pb-4 pt-6"
      surfaceClassName="bg-settings-sidebar border-r border-settings-outline"
      title="Settings"
    >
      <nav aria-label="Settings navigation" className="flex flex-col gap-1">
        {SETTINGS_CATEGORIES.map((category) => (
          <AppButton
            active={category.id === props.activeCategory}
            className={cn(
              'min-h-0 rounded-lg px-5 py-[10px] text-[0.98rem]',
              category.id === props.activeCategory
                ? 'bg-settings-selected font-semibold'
                : 'border-transparent bg-transparent text-foreground/72 hover:bg-settings-selected/70'
            )}
            key={category.id}
            onClick={() => props.setActiveCategory(category.id)}
            variant="list"
          >
            {category.label}
          </AppButton>
        ))}
      </nav>
    </AppPanel>
  );
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
      isSaving={props.isSavingExternalSearchFolders}
      onAddFolder={props.onAddExternalSearchFolder}
      onChooseAttachmentRoot={props.onChooseExternalAttachmentRoot}
      onChooseFolder={props.onChooseExternalSearchFolder}
      onRebuildIndex={props.onRebuildExternalSearchIndex}
      onRemoveFolder={props.onRemoveExternalSearchFolder}
      onUpdateFolder={props.onUpdateExternalSearchFolder}
    />
  );
}

function renderFallbackCategory(props: SettingsCategoryContentProps) {
  if (props.activeCategory === 'import') {
    return props.importCategoryContent ?? <p className="text-sm text-foreground/65">Import content is not available yet.</p>;
  }
  if (props.activeCategory === 'readwise-reader') {
    return props.readwiseReaderCategoryContent ?? (
      <p className="text-sm text-foreground/65">Readwise Reader content is not available yet.</p>
    );
  }
  if (props.activeCategory === 'review') {
    return <ReviewSettingsContent />;
  }
  if (props.activeCategory === 'backups') {
    return <SettingsBackupsSection />;
  }
  if (props.activeCategory === 'about') {
    return <SettingsAboutSection />;
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
  switch (props.activeCategory) {
    case 'editor':
      return <SettingsEditorSection />;
    case 'appearance':
      return <SettingsAppearanceSection />;
    case 'mouse-gestures':
      return <SettingsMouseGesturesSection />;
    case 'library':
      return renderLibraryCategory(props);
    case 'external-search':
      return renderExternalSearchCategory(props);
    default:
      return renderFallbackCategory(props);
  }
}
