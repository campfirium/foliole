import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const DIALOG_SURFACE_FILES = [
  'src/app/components/ReadwiseReaderConfigDialogSurface.tsx',
  'src/app/components/DocumentSourceUpdatePanel.tsx',
  'src/app/components/ExternalSearchPreviewDialog.tsx',
  'src/app/components/KeepImportPreviewDialog.tsx',
  'src/app/components/KeepImportDisableDialog.tsx',
  'src/app/components/CompanionPairingRequestsDialog.tsx'
];

const DIALOG_CONTENT_OVERRIDE_PATTERN =
  /className="[^"]*(?:bg-bg-(?:panel|elevated)|border-border\/35|border-border\/45|rounded-(?:xl|2xl))[^"]*"/;
const DIALOG_CONTENT_TAG_PATTERN = /<AppDialogContent\b[\s\S]*?>/g;

function readWorkspaceFile(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('dialog surface boundary', () => {
  it('keeps formal dialog surfaces on AppDialogContent styling', () => {
    const offenders = DIALOG_SURFACE_FILES.filter((file) => {
      const tags = readWorkspaceFile(file).match(DIALOG_CONTENT_TAG_PATTERN) ?? [];
      return tags.some((tag) => DIALOG_CONTENT_OVERRIDE_PATTERN.test(tag));
    });

    expect(offenders).toEqual([]);
  });
});
