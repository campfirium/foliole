import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SOURCE_UPDATE_SURFACE_FILES = [
  'src/app/components/SourceUpdatePanelColumns.tsx',
  'src/app/components/SourceUpdateSummaryBar.tsx',
  'src/app/components/importSourceWorkspaceModel.ts'
];

function readWorkspaceFile(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('source update surface boundary', () => {
  it('keeps source update and import controls off generic panel backgrounds', () => {
    const offenders = SOURCE_UPDATE_SURFACE_FILES.filter((file) => /bg-bg-(?:panel|elevated)/.test(readWorkspaceFile(file)));

    expect(offenders).toEqual([]);
  });
});
