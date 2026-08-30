import path from 'node:path';

import { parseWindowsDevFailureEvidence } from './windows-dev-control-evidence.mjs';
import {
  WINDOWS_DEFAULT_SYNC_JOURNEY_ACTION,
  WINDOWS_DEFAULT_SYNC_JOURNEY_RECEIPT,
  WINDOWS_DEFAULT_SYNC_JOURNEY_SCREENSHOTS
} from './windows-default-sync-journey-action.mjs';
import { WINDOWS_DEV_EVIDENCE_PREFIX } from './windows-dev-paths.mjs';

const SUCCESS_FILES = [
  WINDOWS_DEFAULT_SYNC_JOURNEY_RECEIPT,
  'summary.json',
  'action.log',
  ...WINDOWS_DEFAULT_SYNC_JOURNEY_SCREENSHOTS
];

function parseSuccessEvidence(output) {
  const match = /^\[windows-dev-action\] default-sync-journey identity=([A-Za-z0-9.-]{1,96}) manifest=([^\r\n]+)$/mu
    .exec(output);
  if (!match) throw new Error('Windows default Sync journey did not report fixed evidence.');
  const remoteRoot = `${WINDOWS_DEV_EVIDENCE_PREFIX}${match[1]}`;
  if (match[2].replaceAll('\\', '/') !== `${remoteRoot}/${WINDOWS_DEFAULT_SYNC_JOURNEY_RECEIPT}`) {
    throw new Error('Windows default Sync journey evidence escaped its fixed root.');
  }
  return { identity: match[1], remoteRoot };
}

function parseRevision(value, label) {
  const revision = String(value ?? '').trim();
  if (!/^[0-9a-f]{40}$/u.test(revision)) throw new Error(`${label} is not a Git revision.`);
  return revision;
}

async function copyFiles({ buildScpSpec, env, executeScp, fsApi, host, localRoot,
  names, remoteRoot }) {
  fsApi.mkdirSync(localRoot, { recursive: true });
  for (const name of names) {
    await executeScp(buildScpSpec(host, `${remoteRoot}/${name}`,
      path.join(localRoot, name), env), { env });
  }
}

async function copyFailure(options, output) {
  const evidence = parseWindowsDevFailureEvidence(output);
  const localRoot = path.join(options.repoRoot, '.tmp', 'artifacts',
    't160-windows-default-sync-journey', evidence.buildIdentity);
  const copyFailures = [];
  for (const name of ['summary.json', 'action.log']) {
    try {
      await copyFiles({ ...options, localRoot, names: [name], remoteRoot: evidence.remoteRoot });
    } catch (error) {
      copyFailures.push({ message: error.message, name });
    }
  }
  return { copyFailures, localRoot };
}

export async function runWindowsDefaultSyncJourneyControl(options) {
  if (options.action !== WINDOWS_DEFAULT_SYNC_JOURNEY_ACTION) return null;
  const localRevision = parseRevision(await options.executeGit(
    ['rev-parse', options.sourceRef], { env: options.env }
  ), 'Mac dev source revision');
  const push = options.buildPushSpec(options.host, options.env, undefined, options.sourceRef);
  await options.executeGit(push.args, { env: push.env });
  const pushedRevision = parseRevision(await options.executeGit(
    ['rev-parse', options.sourceRef], { env: options.env }
  ), 'Mac dev source revision after push');
  if (pushedRevision !== localRevision) {
    throw new Error('Mac dev moved while preparing the Windows default Sync journey.');
  }
  let output;
  let streamed = false;
  try {
    output = await options.executeSsh(
      options.buildSshSpec(options.host, options.action, options.env), {
        env: options.env, onOutput: (chunk) => {
          streamed = true;
          options.stdout.write(chunk);
        }, timeout: 35 * 60_000
      }
    );
  } catch (error) {
    output = error.output || error.message;
    if (!streamed && output) options.stdout.write(output);
    try {
      const copied = await copyFailure(options, output);
      error.evidenceCopyFailures = copied.copyFailures;
      error.evidenceRoot = copied.localRoot;
    } catch {
      // The original remote failure remains authoritative when no fixed receipt was emitted.
    }
    throw error;
  }
  if (!streamed && output) options.stdout.write(output);
  const evidence = parseSuccessEvidence(output);
  const localRoot = path.join(options.repoRoot, '.tmp', 'artifacts',
    't160-windows-default-sync-journey', evidence.identity);
  try {
    await copyFiles({ ...options, localRoot, names: SUCCESS_FILES,
      remoteRoot: evidence.remoteRoot });
  } catch (error) {
    error.evidenceRoot = localRoot;
    throw error;
  }
  const receiptPath = path.join(localRoot, WINDOWS_DEFAULT_SYNC_JOURNEY_RECEIPT);
  const receipt = JSON.parse(options.fsApi.readFileSync(receiptPath, 'utf8'));
  const summary = JSON.parse(options.fsApi.readFileSync(path.join(localRoot, 'summary.json'), 'utf8'));
  const remoteRevision = parseRevision(receipt.sourceRevision, 'Windows source revision');
  if (receipt.resultStatus !== 'success' || summary.resultStatus !== 'success'
      || summary.sourceRevision !== remoteRevision || remoteRevision !== localRevision) {
    const error = new Error('Windows default Sync journey revision evidence does not match Mac dev.');
    error.evidenceRoot = localRoot;
    throw error;
  }
  return { acceptedTip: remoteRevision, action: options.action, evidenceRoot: localRoot,
    manifestPath: receiptPath, operation: 'complete', ref: options.sourceRef };
}
