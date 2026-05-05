import type { ReactNode } from 'react';

import type { HotkeySettingItem, HotkeyUpdateResult } from '../model/hotkeySettings';
import { SETTINGS_CATEGORIES, type SettingsCategoryId } from '../model/settingsPanelOptions';

import { HotkeySettingsSection } from './HotkeySettingsSection';
import { SettingsAboutSection } from './sections/SettingsAboutSection';
import { SettingsAppearanceSection } from './sections/SettingsAppearanceSection';
import { SettingsBackupsSection } from './sections/SettingsBackupsSection';
import { SettingsEditorSection } from './sections/SettingsEditorSection';
import { SettingsImportSection } from './sections/SettingsImportSection';
import { SettingsMouseGesturesSection } from './sections/SettingsMouseGesturesSection';
import { SettingsReviewSection } from './sections/SettingsReviewSection';

import { cn } from '@/shared/lib/utils';
import { AppButton, AppPanel } from '@/shared/ui';

export interface SettingsCategoryContentProps {
  activeCategory: SettingsCategoryId;
  assetsPath: string;
  errorByLocation: Record<'assets_dir' | 'inbox' | 'library_home' | 'mirror', string | null>;
  hotkeyItems: HotkeySettingItem[];
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
  importCategoryContent?: ReactNode;
  onChangeLocation: (location: 'assets_dir' | 'inbox' | 'library_home' | 'mirror') => void;
  onRebuildMirrorLinks: () => void;
  onRebuildMirrorOutput: () => void;
  onRestoreDefault: (location: 'assets_dir' | 'inbox' | 'library_home' | 'mirror') => void;
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

export function SettingsCategoryContent(props: SettingsCategoryContentProps) {
  if (props.activeCategory === 'editor') {
    return <SettingsEditorSection />;
  }
  if (props.activeCategory === 'appearance') {
    return <SettingsAppearanceSection />;
  }
  if (props.activeCategory === 'mouse-gestures') {
    return <SettingsMouseGesturesSection />;
  }
  if (props.activeCategory === 'library') {
    return (
      <SettingsImportSection
        errorByLocation={props.errorByLocation}
        assetsPath={props.assetsPath}
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
  if (props.activeCategory === 'import') {
    return props.importCategoryContent ?? <p className="text-sm text-foreground/65">Import content is not available yet.</p>;
  }
  if (props.activeCategory === 'readwise-reader') {
    return props.readwiseReaderCategoryContent ?? <p className="text-sm text-foreground/65">Readwise Reader content is not available yet.</p>;
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
  return <HotkeySettingsSection items={props.hotkeyItems} onReset={props.onHotkeyReset} onResetAll={props.onHotkeyResetAll} onUpdate={props.onHotkeyUpdate} />;
}
