import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const REVIEW_OVERLAY_CONTROL_FILES = [
  'src/app/components/SourceUpdateOverviewRuler.tsx',
  'src/app/components/DocumentPriorityQuickSetHint.tsx',
  'src/app/components/ReviewTopicDelayPanel.tsx'
];

function readWorkspaceFile(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('review overlay control boundary', () => {
  it('keeps overlay controls on surface control tokens', () => {
    const offenders = REVIEW_OVERLAY_CONTROL_FILES.filter((file) => /bg-bg-(?:panel|elevated)/.test(readWorkspaceFile(file)));

    expect(offenders).toEqual([]);
  });
});
