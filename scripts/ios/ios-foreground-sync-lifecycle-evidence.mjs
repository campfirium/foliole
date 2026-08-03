import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function setPhase(options, phase, action) {
  writeFileSync(
    path.join(options.artifactDir, 'lifecycle-control.json'),
    `${JSON.stringify({ phase })}\n`
  );
  recordAction(options, phase, action);
}

export function recordAction(options, phase, action) {
  const file = path.join(options.artifactDir, 'lifecycle-actions.json');
  let actions = [];
  try {
    actions = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    // The first action creates the evidence file.
  }
  actions.push({ action, at: new Date().toISOString(), phase });
  writeFileSync(file, `${JSON.stringify(actions, null, 2)}\n`);
}
