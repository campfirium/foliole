/* global console */

import fs from 'node:fs';
import path from 'node:path';

import { runMacosA5InstrumentationMechanics } from './macos-a5-sync-group-maintenance-action.mjs';
import { prepareS220EvidenceRoot } from './macos-a5-s220-evidence-root.mjs';
import { inspectS220A5Group } from './macos-a5-s220-group-inspect.mjs';
import { assertS220A5NetworkRestored, confirmS220A5NetworkRestored,
  inspectS220A5Network } from './macos-a5-s220-network-status.mjs';
import { S220_APP_ID } from './macos-a5-s220-package-inventory.mjs';
import { classifyS220ResourceDiagnostic } from './macos-a5-s220-resource-diagnostic-classifier.mjs';
import {
  buildS220ResourceDiagnosticInstrumentationArgs
} from './macos-a5-s220-resource-diagnostic-args.mjs';

const TEST_CLASS = 'com.foliole.android.FolioleS220ResourceDiagnosticTest';

function extractReceipt(stdout) {
  const encoded = stdout.match(/folioleS220ResourceDiagnostic=(\{[^\n]+\})/u)?.[1];
  if (!encoded) throw new Error('S220 resource diagnostic receipt missing.');
  return JSON.parse(encoded);
}

function flattenImages(receipt) {
  return receipt.images.map((image) => ({ hash: image.hash, local: image.local,
    resolver: image.resolver, widget: image.browser?.widget ?? null,
    dom: image.browser?.dom ?? null,
    fetch: image.browser?.fetch ?? null, decode: image.browser?.decode ?? null }));
}

export async function diagnoseS220A5Resource(args) {
  const { assertFixed, buildIdentity, env, execute, paths, serial } = args;
  assertFixed();
  const root = path.join(paths.artifactsRoot, 'S220', 'final-same-tip',
    'a5-resource-diagnostic');
  const receiptPath = path.join(root, 'receipt.json');
  prepareS220EvidenceRoot(root, receiptPath);
  const fixture = JSON.parse(fs.readFileSync(path.join(paths.artifactsRoot, 'S220',
    'a5-resource', 'receipt.json'), 'utf8')).fixture;
  const snapshotPath = await inspectS220A5Group({ assertFixed, paths, serial });
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  if (!fixture?.nodeId || fixture.images?.length !== 2
    || !fixture.images.every((image) => snapshot.attachments.files.some((file) =>
      file.contentHash === image.hash && file.storageKey === image.storageKey))) {
    throw new Error('S220 resource diagnostic fixture bytes are not both cached on A5.');
  }
  let run;
  let runError;
  try {
    run = await runMacosA5InstrumentationMechanics({ appId: S220_APP_ID,
      buildIdentity, env, evidenceRoot: path.join(root, 'android-test'), execute,
      installMain: false, instrumentationOwnsActivity: true, needsTransport: false,
      instrumentationArgs: buildS220ResourceDiagnosticInstrumentationArgs(
        fixture, snapshot.inspection.group.group_id
      ), paths, serial,
      testClass: TEST_CLASS,
      validateInstrumentation: ({ stdout }) => {
        if (!/folioleS220ResourceDiagnostic=\{.+"networkRestored":\{"restored":true/u
          .test(stdout)) throw new Error('S220 diagnostic did not restore its owned network state.');
      } });
  } catch (error) { runError = error; }
  const independentNetworkPath = await inspectS220A5Network({ assertFixed, execute,
    paths, serial });
  assertS220A5NetworkRestored(JSON.parse(fs.readFileSync(independentNetworkPath, 'utf8')));
  if (runError) throw runError;
  const nativeReceipt = extractReceipt(run.stdout);
  const images = flattenImages(nativeReceipt);
  const document = nativeReceipt.document ?? null;
  const receipt = { appId: S220_APP_ID, fixture, document, images,
    classification: classifyS220ResourceDiagnostic(document, images),
    networkOff: JSON.stringify(nativeReceipt.networkOff),
    networkRestored: JSON.stringify(nativeReceipt.networkRestored), stage: 'captured' };
  receipt.networkStatus = await confirmS220A5NetworkRestored({ assertFixed, execute,
    paths, receipt, serial });
  receipt.resultStatus = 'success';
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`[macos-a5-dev] S220 resource diagnostic=${receiptPath}`);
  return receipt;
}
