import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const CONTROL_SOURCE_FILES = [
  'src/app/components/DocumentPanelNodeReviewSettings.tsx',
  'src/features/editor/adapters/imageClozeWidgetDom.ts'
];

function readWorkspaceFile(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('document surface control boundary', () => {
  it('keeps document controls off generic elevated backgrounds', () => {
    const offenders = CONTROL_SOURCE_FILES.filter((file) => readWorkspaceFile(file).includes('bg-bg-elevated'));

    expect(offenders).toEqual([]);
  });
});
