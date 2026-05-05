import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, it } from 'vitest';

const SETTINGS_FILES = [
  'src/features/settings/components/HotkeySettingsSection.tsx',
  'src/features/settings/components/sections/SettingsEditorSection.tsx',
  'src/features/settings/components/sections/SettingsImportSection.tsx',
  'src/features/settings/components/sections/SettingsMouseGesturesSection.tsx',
  'src/features/settings/components/sections/backupSettingsSectionParts.tsx',
  'src/features/settings/components/sections/reviewSettingsControls.tsx',
  'src/features/settings/components/sections/settingsAppearanceControls.tsx',
  'src/features/settings/components/sections/NodeListRowSpacingSection.tsx',
  'src/features/settings/components/sections/SettingsAppearanceSection.tsx',
  'src/features/settings/components/sections/SettingsExternalSearchSection.tsx',
  'src/features/settings/components/sections/SettingsExternalSearchSectionParts.tsx',
  'src/features/settings/components/sections/WorkspaceSurfaceAutomaticPaletteCard.tsx',
  'src/features/settings/components/sections/WorkspaceSurfaceAutomaticSeedPopover.tsx',
  'src/features/settings/components/sections/WorkspaceSurfaceColorEditorFields.tsx',
  'src/features/settings/components/sections/WorkspaceSurfaceColorModePanel.tsx',
  'src/features/settings/components/sections/WorkspaceSurfaceColorPaletteStrip.tsx',
  'src/features/settings/components/sections/WorkspaceSurfaceColorSection.tsx',
  'src/features/settings/components/sections/WorkspaceSurfaceGrid.tsx',
  'src/features/settings/components/sections/WorkspaceSurfaceRandomPalettePanel.tsx',
  'src/features/settings/components/sections/WorkspaceSurfaceThemeFavoritesPopover.tsx',
  'src/features/settings/components/sections/WorkspaceSurfaceThemeToolbar.tsx'
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

it('keeps settings controls on shared settings tokens instead of reintroducing private field surfaces', () => {
  for (const file of SETTINGS_FILES) {
    const content = readFileSync(resolve(process.cwd(), file), 'utf8');
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(content, `${file} should use shared settings token helpers instead of "${pattern}"`).not.toContain(pattern);
    }
  }
});
