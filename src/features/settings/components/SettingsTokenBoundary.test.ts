import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, it } from 'vitest';

const SETTINGS_FILES = [
  'src/features/settings/components/SettingsSearchBox.tsx',
  'src/features/settings/components/SettingsSidebar.tsx',
  'src/features/settings/components/SettingsPanelDialog.tsx',
  'src/features/settings/components/HotkeySettingsSection.tsx',
  'src/features/settings/components/sections/SettingsEditorSection.tsx',
  'src/features/settings/components/sections/SettingsImportSection.tsx',
  'src/features/settings/components/sections/SettingsMouseGesturesSection.tsx',
  'src/features/settings/components/sections/backupSettingsSectionParts.tsx',
  'src/features/settings/components/sections/reviewSettingsControls.tsx',
  'src/features/settings/components/sections/settingsAppearanceControls.tsx',
  'src/features/settings/components/sections/SettingsAppearanceColorSections.tsx',
  'src/features/settings/components/sections/NodeListRowSpacingSection.tsx',
  'src/features/settings/components/sections/SettingsAppearanceSection.tsx',
  'src/features/settings/components/sections/SettingsExternalSearchSection.tsx',
  'src/features/settings/components/sections/SettingsExternalSearchSectionParts.tsx',
  'src/features/settings/components/sections/WorkspaceSurfaceAutomaticPaletteCard.tsx',
  'src/features/settings/components/sections/WorkspaceSurfaceAutomaticSeedPopover.tsx',
  'src/features/settings/components/sections/WorkspaceSurfaceColorEditorFields.tsx',
  'src/features/settings/components/sections/WorkspaceSurfaceColorEditorValueFields.tsx',
  'src/features/settings/components/sections/WorkspaceSurfaceColorModePanel.tsx',
  'src/features/settings/components/sections/WorkspaceSurfaceColorPickerPanel.tsx',
  'src/features/settings/components/sections/WorkspaceSurfaceColorPaletteStrip.tsx',
  'src/features/settings/components/sections/WorkspaceSurfaceColorSection.tsx',
  'src/features/settings/components/sections/WorkspaceSurfaceGrid.tsx',
  'src/features/settings/components/sections/WorkspaceSurfaceRandomPalettePanel.tsx',
  'src/features/settings/components/sections/WorkspaceSurfaceThemeFavoritesPopover.tsx',
  'src/features/settings/components/sections/WorkspaceSurfaceThemeToolbar.tsx',
  'src/features/settings/components/sections/SettingsRailIconPicker.tsx'
];
const SETTINGS_DIALOG_FILES = [
  'src/features/settings/components/SettingsPanelDialog.tsx',
  'src/features/settings/components/sections/NodeIconSettingsDialog.tsx',
  'src/features/settings/components/sections/NodeIconSettingsEditorDialog.tsx'
];
const SETTINGS_POPOVER_FILES = [
  'src/features/settings/components/SettingsSearchBox.tsx',
  'src/features/settings/components/sections/nodeIconSettingFields.tsx'
];

const FORBIDDEN_PATTERNS = [
  'rounded-md border border-border bg-bg-elevated',
  'rounded-md border border-border bg-bg-panel',
  'px-2 py-1.5 text-sm text-foreground',
  'px-3 py-1.5 text-sm text-foreground',
  'flex-[0_0_320px]',
  'flex-[0_0_240px]',
  'w-[136px]',
  'w-[144px]',
  'min-w-[160px]',
  'bg-bg-elevated',
  'bg-foreground/[',
  'border-border/'
];

const REQUIRED_HELPERS_BY_FILE = new Map([
  ['src/features/settings/components/SettingsSidebar.tsx', ['settingsSidebarBadgeClassName', 'settingsSidebarItemClassName']],
  ['src/features/settings/components/SettingsSearchBox.tsx', ['settingsSelectableOptionClassName', 'settingsPopoverSurfaceClassName']],
  ['src/features/settings/components/sections/SettingsRailIconPicker.tsx', ['settingsIconGridButtonClassName']],
  ['src/features/settings/components/sections/WorkspaceSurfaceColorEditorValueFields.tsx', ['settingsCompactButtonClassName', 'settingsCompactFieldClassName']],
  ['src/features/settings/components/sections/WorkspaceSurfaceColorPickerPanel.tsx', ['settingsPickerTrackClassName']],
  ['src/features/settings/components/sections/WorkspaceSurfaceThemeToolbar.tsx', ['settingsCompactUtilityIconButtonClassName']]
]);

it('keeps settings controls on shared settings tokens instead of reintroducing private field surfaces', () => {
  for (const file of SETTINGS_FILES) {
    const content = readFileSync(resolve(process.cwd(), file), 'utf8');
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(content, `${file} should use shared settings token helpers instead of "${pattern}"`).not.toContain(pattern);
    }
  }
});

it('keeps migrated settings control chrome on shared helper entry points', () => {
  for (const [file, helpers] of REQUIRED_HELPERS_BY_FILE) {
    const content = readFileSync(resolve(process.cwd(), file), 'utf8');
    for (const helper of helpers) {
      expect(content, `${file} should consume ${helper}`).toContain(helper);
    }
  }
});

it('keeps settings dialog shells on shared settings dialog helpers', () => {
  for (const file of SETTINGS_DIALOG_FILES) {
    const content = readFileSync(resolve(process.cwd(), file), 'utf8');

    expect(content, `${file} should consume the shared settings dialog helper`).toMatch(
      /settings(?:Nested)?DialogSurfaceClassName/
    );
    expect(content, `${file} should not hand-write the settings dialog shell`).not.toContain(
      'rounded-lg border-settings-outline'
    );
    expect(content, `${file} should not hand-write the settings dialog shadow`).not.toContain(
      'shadow-settings'
    );
  }
});

it('keeps settings popover shells on shared settings popover helpers', () => {
  for (const file of SETTINGS_POPOVER_FILES) {
    const content = readFileSync(resolve(process.cwd(), file), 'utf8');

    expect(content, `${file} should consume the shared settings popover helper`).toContain(
      'settingsPopoverSurfaceClassName'
    );
    expect(content, `${file} should not hand-write settings popover borders`).not.toContain(
      'border border-settings-outline'
    );
    expect(content, `${file} should not hand-write settings popover shadows`).not.toContain(
      'shadow-settings'
    );
  }
});
