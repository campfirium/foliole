import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const FLOATING_TOOLBAR_FILES = [
  'src/app/components/DocumentTopicSearchToolbar.tsx',
  'src/app/components/PdfDocumentToolbar.tsx',
  'src/app/components/WebLookupSelectionMenu.tsx',
  'src/features/nodes/components/NodeListFeedbackSurface.tsx'
];
const STATE_SURFACE_CONSUMER_FILES = [
  'src/app/components/WebLookupSelectionMenu.tsx',
  'src/features/nodes/components/NodeListFeedbackSurface.tsx'
];

function readWorkspaceFile(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('floating toolbar surface boundary', () => {
  it('keeps transient toolbars and status surfaces off generic elevated backgrounds', () => {
    const offenders = FLOATING_TOOLBAR_FILES.filter((file) => /bg-bg-(?:panel|elevated)/.test(readWorkspaceFile(file)));

    expect(offenders).toEqual([]);
  });

  it('keeps state surface chrome inside the shared floating helper', () => {
    const repeatedChromePattern =
      /appFloatingStateSurfaceClassName\('[^']*(?:border border-\[var\(--app-floating-border-color\)\]|bg-\[var\(--app-floating-surface-bg\)\]|shadow-control|rounded-md)/;
    const offenders = STATE_SURFACE_CONSUMER_FILES.filter((file) => repeatedChromePattern.test(readWorkspaceFile(file)));

    expect(offenders).toEqual([]);
  });
});
