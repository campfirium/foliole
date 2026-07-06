import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

function readWorkspaceFile(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('companion readable typography', () => {
  it('keeps Android reading typography local to companion surfaces', () => {
    const companionFiles = [
      'src/companion/CompanionReadableArticleDocument.tsx',
      'src/companion/CompanionReadingTypographyControls.tsx',
      'src/companion/useCompanionReadingTypographySettings.ts'
    ];

    const combined = companionFiles.map(readWorkspaceFile).join('\n');

    expect(combined).toContain('--content-panel-line-height');
    expect(combined).toContain('--content-panel-paragraph-spacing');
    expect(combined).toContain('--document-content-inline-padding');
    expect(combined).toContain('0px');
    expect(combined).toContain('0.35em');
    expect(combined).toContain('--content-panel-font-family');
    expect(combined).not.toContain('saveCompanionSyncSettingRecord');
    expect(combined).not.toContain('appSettingsClassification');
  });
});
