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
  'src/features/settings/components/sections/NodeListRowSpacingSection.tsx'
];

const FORBIDDEN_PATTERNS = [
  'rounded-md border border-border bg-bg-elevated',
  'rounded-md border border-border bg-bg-panel',
  'px-2 py-1.5 text-sm text-foreground',
  'px-3 py-1.5 text-sm text-foreground'
];

it('keeps settings controls on shared settings tokens instead of reintroducing private field surfaces', () => {
  for (const file of SETTINGS_FILES) {
    const content = readFileSync(resolve(process.cwd(), file), 'utf8');
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(content, `${file} should use shared settings token helpers instead of "${pattern}"`).not.toContain(pattern);
    }
  }
});
