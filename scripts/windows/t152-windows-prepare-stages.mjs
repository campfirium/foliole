import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';

import { createT152WindowsPrepareRequest, t152PrepareRemoteCommand } from
  './t152-windows-prepare-request.mjs';
import { PREPARE_DEADLINE_MS, PREPARE_STAGES } from
  './t152-windows-prepare-stage-contract.mjs';
import { atomicJson, createControlBundle, parseControlBundleScripts, serialTransfers, terminalState,
  transferTerminal as terminal, verifyAndCollectControlBundle } from './t152-windows-transfer-journal.mjs';
import { validateBindingPreflight, validateNpmRuntimeOwner, validatePrepareStageReceipt,
  validateStagePlanProjection } from './t152-windows-prepare-validation.mjs';

export { PREPARE_DEADLINE_MS, PREPARE_STAGES };
export { validateBindingPreflight, validateNpmRuntimeOwner, validatePrepareStageReceipt,
  validateStagePlanProjection } from './t152-windows-prepare-validation.mjs';

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function copy(command, args, options) {
  const result = await terminal(command, args, options);
  if (result.exitCode !== 0) throw Object.assign(new Error(`${command} transfer failed`), result);
  return result;
}

function localTerminalReceipt(capsule, name, value) {
  const file = path.join(capsule.root, name);
  const reread = atomicJson(file, value);
  if (digest(fs.readFileSync(file)) !== digest(Buffer.from(`${JSON.stringify(value, null, 2)}\n`))) {
    throw new Error(`${name} atomic reread failed`);
  }
  return { file, receipt: reread };
}

export async function runT152WindowsPrepareStages({ capsule, env, host, hostFactsSha256,
  paths, prepareRequestInput, sshBase, staging }) {
  let deadlineAt = Date.now() + PREPARE_DEADLINE_MS;
  const remote = (local, target) => copy('scp', ['-q', ...sshBase, local,
    `${host}:${target.replaceAll('\\', '/')}`], { deadlineAt, env });
  const bundle = createControlBundle({ bundleId: prepareRequestInput.capsuleId,
    capsuleRoot: capsule.root, files: [staging.actionLocal, staging.collectionsLocal,
      staging.contractLocal, staging.interactiveLocal,
      staging.npmOwnerLocal, staging.parserLocal, staging.requestLocal, staging.runnerLocal,
      staging.transferLocal,
      staging.verifierLocal],
    remoteBaseRoot: staging.remoteBaseRoot });
  if (staging.action !== path.win32.join(bundle.remoteRoot, path.basename(staging.actionLocal))
      || staging.runner !== path.win32.join(bundle.remoteRoot, path.basename(staging.runnerLocal))) {
    throw new Error('prepare control bundle path mismatch');
  }
  const controlTransfer = await serialTransfers([{ local: bundle.archive,
    remote: bundle.remoteArchive }], ({ local, remote: target }) => remote(local, target));
  const extractTerminal = terminal('ssh', ['-T', ...sshBase, host,
    prepareRequestInput.tarPath, '-xf', bundle.remoteArchive, '-C',
    path.win32.dirname(bundle.remoteRoot)], { deadlineAt, env });
  const extracted = await extractTerminal;
  const parser = terminalState(extracted) === 'success'
    ? await parseControlBundleScripts({ deadlineAt, env, host, parserPath: staging.parser,
      sshBase, verificationToken: bundle.verificationToken })
    : { parsed: null, state: 'not_started', terminal: null };
  const verify = parser.state === 'success' ? await verifyAndCollectControlBundle({
    actionPath: staging.action, bundle, deadlineAt, env, host,
    localFile: path.join(capsule.root, 'g1a-control-bundle-verification.json'), sshBase })
    : { receipt: { parsed: null, state: 'not_started', terminal: null },
      state: 'not_started', terminal: null };
  const controlBundle = localTerminalReceipt(capsule, 'g1a-control-bundle-terminal.json', {
    bundle, extract: { state: terminalState(extracted), terminal: extracted },
    parser, schemaVersion: 1, transfer: controlTransfer, verify });
  if (controlTransfer[0]?.terminalState !== 'success' || terminalState(extracted) !== 'success'
      || parser.state !== 'success' || !parser.parsed
      || parser.parsed.scripts.some((script) => script.errors.length !== 0)
      || verify.receipt.state !== 'success' || verify.state !== 'success'
      || verify.receipt.parsed.failure !== null) {
    throw Object.assign(new Error('prepare control bundle failed'), { controlBundle });
  }
  const runtimeOwnerTerminal = await terminal('ssh', ['-T', ...sshBase, host,
    'powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', staging.action, '-Action', 'runtime-owner'], { deadlineAt, env });
  const runtimeOwner = JSON.parse(/^T152_RUNTIME_OWNER=(.+)$/mu.exec(
    runtimeOwnerTerminal.stdout)?.[1] ?? 'null');
  const runtimeOwnerReceipt = localTerminalReceipt(capsule, 'g1a-runtime-owner-terminal.json', {
    parsed: runtimeOwner, schemaVersion: 1, terminal: runtimeOwnerTerminal });
  if (terminalState(runtimeOwnerTerminal) !== 'success') {
    throw Object.assign(new Error('prepare runtime owner terminal failed'), { runtimeOwnerReceipt });
  }
  validateNpmRuntimeOwner(runtimeOwner, prepareRequestInput);
  const preparedRequest = createT152WindowsPrepareRequest({ ...prepareRequestInput,
    nodePath: runtimeOwner.nodePath, npmCliPath: runtimeOwner.npmCliPath,
    npmCommandPath: runtimeOwner.npmCommandPath, npmRuntimeOwner: runtimeOwner });
  const preflightTerminal = await terminal('ssh', ['-T', ...sshBase, host,
    ...t152PrepareRemoteCommand(staging.action, 'binding-preflight', preparedRequest.token)],
  { deadlineAt, env });
  const parsed = JSON.parse(/^T152_BINDING_PREFLIGHT=(.+)$/mu.exec(
    preflightTerminal.stdout)?.[1] ?? 'null');
  const launcherTerminal = await terminal('ssh', ['-T', ...sshBase, host,
    ...t152PrepareRemoteCommand(staging.action, 'launcher-preflight', preparedRequest.token)],
  { deadlineAt, env });
  const launcher = JSON.parse(/^T152_NPM_LAUNCHER=(.+)$/mu.exec(
    launcherTerminal.stdout)?.[1] ?? 'null');
  const planTerminal = await terminal('ssh', ['-T', ...sshBase, host,
    ...t152PrepareRemoteCommand(staging.action, 'stage-plan-preflight', preparedRequest.token)],
  { deadlineAt, env });
  const stagePlan = JSON.parse(/^T152_STAGE_PLAN=(.+)$/mu.exec(planTerminal.stdout)?.[1] ?? 'null');
  const absence = { archivesUploaded: false, capsuleMaterialized: false,
    dependenciesStarted: false, longPrepareStarted: false, productStarted: false };
  const preflight = localTerminalReceipt(capsule, 'g1a-binding-terminal.json', {
    absence, capsuleId: preparedRequest.request.capsuleId,
    capsuleRoot: preparedRequest.request.capsuleRoot, hostFactsSha256,
    identity: preparedRequest.request.identity, launcher, launcherTerminal, parsed,
    planTerminal, stagePlan,
    requestSha256: preparedRequest.requestSha256, rootId: preparedRequest.request.rootId,
    schemaVersion: 1, terminal: preflightTerminal, tokenSha256: digest(preparedRequest.token) });
  try {
    if (preflightTerminal.exitCode !== 0 || preflightTerminal.signal !== null
        || preflightTerminal.timedOut) throw new Error('prepare binding terminal failed');
    validateBindingPreflight(parsed, preparedRequest.request, preparedRequest.requestSha256);
    if (launcherTerminal.exitCode !== 0 || launcherTerminal.signal !== null
        || launcherTerminal.timedOut || launcher?.descriptor?.file !== preparedRequest.request.nodePath
        || launcher?.descriptor?.args?.[0] !== preparedRequest.request.npmCliPath
        || launcher?.descriptor?.shell !== false || launcher?.rawExit !== 0
        || launcher?.rawSignal !== null || launcher?.timedOut !== false || !launcher?.version
        || !Object.values(launcher?.fileIdentities ?? {}).every((item) =>
          /^[0-9a-f]{64}$/u.test(item?.sha256 ?? ''))) {
      throw new Error('prepare npm launcher preflight failed');
    }
    if (planTerminal.exitCode !== 0 || planTerminal.signal !== null || planTerminal.timedOut) {
      throw new Error('prepare stage plan terminal failed');
    }
    validateStagePlanProjection(stagePlan, preparedRequest.request);
  } catch {
    throw Object.assign(new Error('prepare binding preflight failed'), { preflight });
  }
  deadlineAt = Date.now() + PREPARE_DEADLINE_MS;
  const payloadTransfers = await serialTransfers([
    { local: capsule.productArchive, remote: staging.product },
    { local: capsule.controllerArchive, remote: staging.controller },
    { local: capsule.manifestPath, remote: staging.manifest }
  ], ({ local, remote: target }) => remote(local, target));
  const payload = localTerminalReceipt(capsule, 'g1b-payload-transfer-terminal.json', {
    schemaVersion: 1, transfers: payloadTransfers });
  if (payloadTransfers.length !== 3
      || payloadTransfers.some((item) => item.terminalState !== 'success')) {
    throw Object.assign(new Error('prepare payload transfer failed'), { payload });
  }

  const receipts = []; let predecessorReceiptSha256 = null;
  for (const stage of PREPARE_STAGES) {
    const action = `prepare-${stage}`;
    const stageTerminal = await terminal('ssh', ['-T', ...sshBase, host,
      ...t152PrepareRemoteCommand(staging.action, action, preparedRequest.token)],
    { deadlineAt, env });
    const terminalRecord = localTerminalReceipt(capsule, `${action}-outer-terminal.json`, {
      action, deadlineAt: new Date(deadlineAt).toISOString(), schemaVersion: 1,
      terminal: stageTerminal });
    const localReceipt = path.join(capsule.root, `${action}-receipt.json`);
    try {
      await copy('scp', ['-q', ...sshBase,
        `${host}:${path.win32.join(paths.evidenceRoot, `${action}-receipt.json`).replaceAll('\\', '/')}`,
        localReceipt], { deadlineAt, env });
      const receipt = JSON.parse(fs.readFileSync(localReceipt, 'utf8').replace(/^\uFEFF/u, ''));
      validatePrepareStageReceipt(receipt, { capsuleId: preparedRequest.request.capsuleId,
        capsuleRoot: preparedRequest.request.capsuleRoot,
        hostFactsSha256,
        identity: preparedRequest.request.identity, predecessorReceiptSha256,
        planSha256: stagePlan.planSha256,
        requestSha256: preparedRequest.requestSha256, rootId: preparedRequest.request.rootId,
        stage, tokenSha256: digest(preparedRequest.token) });
      predecessorReceiptSha256 = digest(fs.readFileSync(localReceipt));
      receipts.push({ localReceipt, receipt, terminalRecord });
    } catch (error) {
      const notStarted = PREPARE_STAGES.slice(PREPARE_STAGES.indexOf(stage) + 1);
      const failure = localTerminalReceipt(capsule, `${action}-failure.json`, {
        action, error: error.message, notStarted, schemaVersion: 1, terminal: stageTerminal });
      throw Object.assign(new Error(`${action} failed`), { failure, receipts });
    }
    if (stageTerminal.exitCode !== 0 || stageTerminal.signal !== null || stageTerminal.timedOut) {
      throw Object.assign(new Error(`${action} terminal failed`), { receipts });
    }
  }
  return { preflight, preparedRequest, receipts, runtimeOwnerReceipt };
}
