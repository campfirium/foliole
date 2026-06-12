import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const FLOATING_OVERLAY_FILES = [
  'src/app/components/WorkspaceActivityNotice.tsx',
  'src/app/components/NodeLinkHoverPreviewPanel.tsx',
  'src/app/components/LinkPanelStack.tsx',
  'src/app/components/ImmersiveShortcutsOverlay.tsx'
];

function readWorkspaceFile(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('floating overlay surface boundary', () => {
  it('keeps floating overlay chrome on floating surface tokens', () => {
    const offenders = FLOATING_OVERLAY_FILES.filter((file) => /bg-bg-(?:panel|elevated)(?:\/\d+)?/.test(readWorkspaceFile(file)));

    expect(offenders).toEqual([]);
  });
});
