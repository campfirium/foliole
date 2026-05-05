import type { HotkeySettingItem, HotkeyUpdateResult } from '../model/hotkeySettings';
import { SETTINGS_CATEGORIES, type SettingsCategoryId } from '../model/settingsPanelOptions';

import { HotkeySettingsSection } from './HotkeySettingsSection';
import { SettingsAboutSection } from './sections/SettingsAboutSection';
import { SettingsAppearanceSection } from './sections/SettingsAppearanceSection';
import { SettingsEditorSection } from './sections/SettingsEditorSection';
import { SettingsImportSection } from './sections/SettingsImportSection';
import { SettingsMouseGesturesSection } from './sections/SettingsMouseGesturesSection';
import { SettingsReviewSection } from './sections/SettingsReviewSection';

import { cn } from '@/shared/lib/utils';

export interface SettingsCategoryContentProps {
  activeCategory: SettingsCategoryId;
  hotkeyItems: HotkeySettingItem[];
  inboxPath: string;
  inboxPathError: string | null;
  isInboxDesktopRuntime: boolean;
  isInboxPathPending: boolean;
  onInboxPathChangeRequest: () => void;
  onInboxPathRestoreDefault: () => void;
  onHotkeyReset: (commandId: string) => void;
  onHotkeyResetAll: () => void;
  onHotkeyUpdate: (commandId: string, slot: 'primary' | 'secondary', nextLabel: string) => HotkeyUpdateResult;
}

export function SettingsSidebar(props: {
  activeCategory: SettingsCategoryId;
  setActiveCategory: (category: SettingsCategoryId) => void;
}) {
  return (
    <aside aria-label="Settings categories" className="flex flex-col border-r border-border bg-bg-subtle px-2.5 py-3.5">
      <p className="mb-2.5 px-2.5 text-[0.9rem] font-semibold text-foreground/50">Options</p>
      <nav aria-label="Settings navigation" className="flex flex-col gap-0.5">
        {SETTINGS_CATEGORIES.map((category) => (
          <button
            className={cn(
              'rounded-md px-2.5 py-[7px] text-left text-[0.96rem] text-foreground/80 transition-colors hover:bg-foreground/[0.05]',
              category.id === props.activeCategory && 'bg-foreground/[0.08] font-semibold text-foreground'
            )}
            key={category.id}
            onClick={() => props.setActiveCategory(category.id)}
            type="button"
          >
            {category.label}
          </button>
        ))}
      </nav>
    </aside>
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
  if (props.activeCategory === 'import') {
    return (
      <SettingsImportSection
        errorMessage={props.inboxPathError}
        inboxPath={props.inboxPath}
        isDesktopRuntime={props.isInboxDesktopRuntime}
        isPending={props.isInboxPathPending}
        onChangeLocation={props.onInboxPathChangeRequest}
        onRestoreDefault={props.onInboxPathRestoreDefault}
      />
    );
  }
  if (props.activeCategory === 'review') {
    return <ReviewSettingsContent />;
  }
  if (props.activeCategory === 'about') {
    return <SettingsAboutSection />;
  }
  return <HotkeySettingsSection items={props.hotkeyItems} onReset={props.onHotkeyReset} onResetAll={props.onHotkeyResetAll} onUpdate={props.onHotkeyUpdate} />;
}
