import { writeFileSync } from 'node:fs';
import path from 'node:path';

export function writeIosAcceptanceAttemptEvidence(artifactDir, evidence) {
  writeFileSync(
    path.join(artifactDir, 'attempt-evidence.json'),
    `${JSON.stringify(evidence, null, 2)}\n`
  );
}
