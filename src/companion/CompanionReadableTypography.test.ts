import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

function readWorkspaceFile(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('companion readable typography', () => {
  it('keeps companion article surfaces free of private reading typography overrides', () => {
    const companionFiles = [
      'src/companion/CompanionReadableArticleDocument.tsx',
      'src/companion/CompanionArticleDocument.tsx',
      'src/companion/CompanionReadableArticleSurface.tsx',
      'src/companion/CompanionReadingSheets.tsx'
    ];

    const combined = companionFiles.map(readWorkspaceFile).join('\n');

    expect(combined).not.toContain('--content-panel-line-height');
    expect(combined).not.toContain('--content-panel-font-family');
    expect(combined).not.toMatch(/fontFamily\s*:/);
    expect(combined).not.toMatch(/lineHeight\s*:/);
  });
});
