import { createHash } from 'node:crypto';
import path from 'node:path';

import { canonicalPrepareJson } from './t152-windows-prepare-request.mjs';
import { PREPARE_STAGES } from './t152-windows-prepare-stage-contract.mjs';

function digest(value) { return createHash('sha256').update(value).digest('hex'); }

export function validatePrepareStageReceipt(receipt, expected) {
  const identityMatches = Object.entries(expected.identity).every(
    ([key, value]) => receipt.identity?.[key] === value);
  if (receipt.resultStatus !== 'success' || receipt.stage !== expected.stage
      || receipt.requestSha256 !== expected.requestSha256
      || receipt.tokenSha256 !== expected.tokenSha256
      || receipt.capsuleId !== expected.capsuleId || receipt.capsuleRoot !== expected.capsuleRoot
      || receipt.hostFactsSha256 !== expected.hostFactsSha256 || receipt.rootId !== expected.rootId
      || receipt.planSha256 !== expected.planSha256
      || receipt.predecessorReceiptSha256 !== expected.predecessorReceiptSha256
      || !identityMatches || receipt.rawExit !== 0 || receipt.rawSignal !== null) {
    throw new Error(`prepare ${expected.stage} receipt is invalid`);
  }
  return receipt;
}

export function validateBindingPreflight(parsed, request, requestSha256) {
  const paths = ['capsuleRoot', 'controllerArchivePath', 'controllerRoot', 'evidenceRoot',
    'manifestPath', 'nodePath', 'npmCliPath', 'npmCommandPath', 'productArchivePath', 'stageRunnerPath',
    'sourceRoot', 'tarPath'];
  const normalized = parsed?.pathPredicate?.normalizedPaths;
  const rejected = parsed?.pathPredicate?.selfcheck?.rejected;
  const pathExact = paths.every((field) => normalized?.[field]?.value === request[field]
    && normalized[field].normalized === request[field]
    && normalized[field].localRoot === path.win32.parse(request[field]).root);
  const negativeExact = ['relative', 'driveRelative', 'rootRelative', 'uri',
    'normalizationMismatch'].every((field) => rejected?.[field] === true);
  if (parsed?.requestSha256 !== requestSha256 || parsed?.runtimeExact !== true
      || !Object.values(parsed?.runtimeExists ?? {}).every((value) => value === true)
      || !parsed?.pathPredicate?.powershellVersion || !parsed?.pathPredicate?.clrVersion
      || !/^[0-9a-f]{64}$/u.test(parsed?.pathPredicate?.schemaSha256 ?? '')
      || !pathExact || !negativeExact) throw new Error('prepare binding preflight failed');
  return parsed;
}

export function validateStagePlanProjection(parsed, request) {
  const stages = parsed?.plan?.entries?.map((entry) => entry.stage);
  const argvScalar = parsed?.plan?.entries?.every((entry) => entry.commands.every((command) =>
    command.shell === false && typeof command.file === 'string'
      && command.args.every((value) => typeof value === 'string')));
  const matrices = PREPARE_STAGES.every((stage) => {
    const matrix = parsed?.matrices?.[stage];
    return matrix?.success?.resultStatus === 'success'
      && matrix?.failure?.resultStatus === 'failed' && matrix?.timeout?.resultStatus === 'timeout'
      && [matrix.success, matrix.failure, matrix.timeout].every((receipt) =>
        receipt.planSha256 === parsed.planSha256 && receipt.rootId === request.rootId);
  });
  const npmNames = ['dependencies', 'build', 'electron-compile', 'native-rebuild', 'package-smoke'];
  const npmCommands = parsed?.plan?.entries?.flatMap((entry) => entry.commands)
    .filter((command) => npmNames.includes(command.name));
  const launcherExact = npmCommands?.length === npmNames.length && npmCommands.every((command) =>
    command.file === request.nodePath && command.args[0] === request.npmCliPath
      && command.shell === false);
  if (JSON.stringify(stages) !== JSON.stringify(PREPARE_STAGES) || !argvScalar || !matrices
      || !launcherExact || !/^[0-9a-f]{64}$/u.test(parsed?.planSha256 ?? '')
      || !/^[0-9a-f]{64}$/u.test(parsed?.projectionSha256 ?? '') || !parsed?.nodeVersion) {
    throw new Error('prepare stage plan projection failed');
  }
  return parsed;
}

export function validateNpmRuntimeOwner(receipt, expected) {
  const identities = ['nodePath', 'npmCliPath', 'npmCommandPath', 'npmManifestPath'];
  const unsigned = { ...receipt }; delete unsigned.ownerSha256;
  if (receipt?.schemaVersion !== 1 || receipt.packageName !== 'npm'
      || typeof receipt.packageVersion !== 'string' || !receipt.packageVersion
      || receipt.nodePath !== expected.nodePath || receipt.npmCommandPath !== expected.npmCommandPath
      || !path.win32.isAbsolute(receipt.npmCliPath ?? '')
      || !path.win32.isAbsolute(receipt.npmManifestPath ?? '')
      || receipt.ownerSha256 !== digest(canonicalPrepareJson(unsigned))
      || identities.some((name) => receipt.fileIdentities?.[name]?.path !== receipt[name]
        || !/^[0-9a-f]{64}$/u.test(receipt.fileIdentities?.[name]?.sha256 ?? ''))) {
    throw new Error('npm runtime owner receipt is invalid');
  }
  return receipt;
}
