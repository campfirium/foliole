#!/usr/bin/env node
/* global console, process */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { prepareT152WindowsCapsule, runT152WindowsAdmission } from
  './t152-windows-capsule-control.mjs';

function requiredAbsolute(value, label) {
  if (!path.isAbsolute(value ?? '')) throw new Error(`${label} is required`);
  return value;
}

export async function runT152WindowsAdmissionSequence({ capsuleId = randomUUID(),
  controllerCommit, controllerRoot, productObjectRepo, rootId = randomUUID() }) {
  const prepared = await prepareT152WindowsCapsule({ capsuleId, controllerCommit,
    controllerRoot, productObjectRepo, repoRoot: controllerRoot, rootId });
  const locatorPath = path.join(prepared.capsule.root, 'admission-locator.json');
  try {
    const g2 = await runT152WindowsAdmission({ phase: 'g2-path', prepared, rootId });
    const g3 = await runT152WindowsAdmission({ phase: 'g3-anchor', prepared, rootId });
    const locator = { capsule: prepared.capsule.manifest, completedAt: new Date().toISOString(),
      formalAttempt: { allocated: false, started: false }, g1: {
        hostFacts: prepared.facts, receipt: prepared.receipt }, g2: g2.receipt,
    g3: g3.receipt, resultStatus: 'success', rootId, schemaVersion: 2 };
    fs.writeFileSync(locatorPath, `${JSON.stringify(locator, null, 2)}\n`);
    return { locator, locatorPath, prepared };
  } catch (error) {
    const locator = { capsule: prepared.capsule.manifest, completedAt: new Date().toISOString(),
      error: error.message, formalAttempt: { allocated: false, started: false },
      resultStatus: 'failure', rootId, schemaVersion: 2 };
    fs.writeFileSync(locatorPath, `${JSON.stringify(locator, null, 2)}\n`);
    throw Object.assign(error, { locatorPath });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  const [controllerCommit, controllerRoot, productObjectRepo, rootId, capsuleId] =
    process.argv.slice(2);
  runT152WindowsAdmissionSequence({ capsuleId: capsuleId || randomUUID(), controllerCommit,
    controllerRoot: requiredAbsolute(controllerRoot, 'controller root'),
    productObjectRepo: requiredAbsolute(productObjectRepo, 'product object repo'),
    rootId: rootId || randomUUID() }).then(({ locatorPath }) => console.log(
    `[t152-windows-admission] status=success locator=${locatorPath}`
  )).catch((error) => {
    console.error(`[t152-windows-admission] status=failure locator=${error.locatorPath ?? '-'} message=${error.message}`);
    process.exitCode = 1;
  });
}
