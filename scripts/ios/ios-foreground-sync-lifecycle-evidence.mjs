import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function prepareLifecycleArtifactDirectory(artifactDir) {
  mkdirSync(artifactDir, { recursive: true });
  for (const name of [
    'evidence.json', 'failure.json', 'lifecycle-actions.json', 'lifecycle-control.json', 'result.json', 'simulator.log'
  ]) {
    rmSync(path.join(artifactDir, name), { force: true });
  }
}

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

export function recordLifecycleAttempt(options, lifecycle) {
  writeFileSync(path.join(options.artifactDir, 'attempt-evidence.json'), `${JSON.stringify({ lifecycle }, null, 2)}\n`);
}
