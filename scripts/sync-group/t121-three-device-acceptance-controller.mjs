import fs from 'node:fs';
import path from 'node:path';

/* global structuredClone */

import { nextRequiredStep, recordStep } from './t121-three-device-acceptance-contract.mjs';

function atomicWriteJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const pending = `${filePath}.pending`;
  fs.writeFileSync(pending, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(pending, filePath);
}

export async function runAcceptancePhase({ actions, manifest, manifestPath }) {
  let step = nextRequiredStep(manifest);
  while (step) {
    const action = actions[step];
    if (typeof action !== 'function') throw new Error(`T121 acceptance action is missing: ${step}`);
    const receipt = await action(structuredClone(manifest));
    recordStep(manifest, step, receipt);
    atomicWriteJson(manifestPath, manifest);
    step = nextRequiredStep(manifest);
  }
  return manifest;
}
