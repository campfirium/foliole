import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const FOOTER_SURFACE_FILES = [
  'src/shared/ui/ReviewActionBar.tsx',
  'src/app/components/WorkspaceListStudyStatusBar.tsx'
];

function readWorkspaceFile(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('footer surface boundary', () => {
  it('keeps footer bars on workspace footer region tokens', () => {
    const combined = FOOTER_SURFACE_FILES.map(readWorkspaceFile).join('\n');

    expect(combined).toContain('--workspace-region-footer-document-bg');
    expect(combined).not.toContain('bg-bg-panel');
    expect(combined).not.toContain('bg-bg-elevated');
  });
});
