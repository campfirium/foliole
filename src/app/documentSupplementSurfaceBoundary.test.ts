import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const DOCUMENT_SUPPLEMENT_FILES = [
  'src/app/components/ExternalDocumentPreviewPanel.tsx',
  'src/app/components/ReadwiseBookActionsPanel.tsx'
];

function readWorkspaceFile(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('document supplement surface boundary', () => {
  it('keeps document supplement chrome on semantic surface tokens', () => {
    const offenders = DOCUMENT_SUPPLEMENT_FILES.filter((file) => /bg-bg-panel(?:\/\d+)?/.test(readWorkspaceFile(file)));

    expect(offenders).toEqual([]);
  });
});
