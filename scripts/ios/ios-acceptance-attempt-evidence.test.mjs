import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { writeIosAcceptanceAttemptEvidence } from './ios-acceptance-attempt-evidence.mjs';

it('persists raw scenario observations before product verdict routing', () => {
  const artifactDir = '.tmp/artifacts/ios-acceptance-attempt-evidence-test';
  fs.mkdirSync(artifactDir, { recursive: true });
  writeIosAcceptanceAttemptEvidence(artifactDir, { firstBridge: { status: 'passed' } });
  expect(JSON.parse(fs.readFileSync(path.join(artifactDir, 'attempt-evidence.json'), 'utf8')))
    .toEqual({ firstBridge: { status: 'passed' } });
});
