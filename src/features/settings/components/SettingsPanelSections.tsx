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
      bodyClassName="px-2.5 pb-3.5"
      className="border-r border-border bg-bg-subtle"
      title={<span className="text-foreground/50">Options</span>}
    >
      <nav aria-label="Settings navigation" className="flex flex-col gap-0.5">
        {SETTINGS_CATEGORIES.map((category) => (
          <AppButton
            active={category.id === props.activeCategory}
            className={cn(
              'min-h-0 rounded-md px-2.5 py-[7px] text-[0.96rem]',
              category.id !== props.activeCategory && 'border-transparent'
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
