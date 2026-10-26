import path from 'node:path';

import { WINDOWS_DEV_EVIDENCE_PREFIX } from './windows-dev-paths.mjs';
import { TEST_DATABASE_DIAGNOSTIC_ACTION as ACTION } from './windows-test-database-diagnostic.mjs';

export async function runWindowsTestDatabaseDiagnosticControl({ env, executeGit, executeScp,
  executeSsh, fsApi, host, prepareRuntime, pushSpec, repoRoot, scpSpec, sshSpec, stdout }) {
  await prepareRuntime({ env, executeGit, executeScp, host, repoRoot });
  const push = pushSpec(host, env);
  await executeGit(push.args, { env: push.env });
  let output;
  let remoteError;
  try { output = await executeSsh(sshSpec(host, ACTION), { env }); }
  catch (error) { remoteError = error; output = error.output || error.message; }
  stdout.write(output || '');
  const match = /\[windows-dev-action\] test-database-cleanup identity=([A-Za-z0-9.-]{1,96}) receipt=([^\r\n]+)/u.exec(output);
  if (!match) throw remoteError ?? new Error('Database diagnostic did not report a receipt');
  const remoteRoot = `${WINDOWS_DEV_EVIDENCE_PREFIX}${match[1]}/${ACTION}`;
  if (match[2].trim().replaceAll('\\', '/') !== `${remoteRoot}/receipt.json`) {
    throw new Error('Database diagnostic receipt escaped its fixed evidence root');
  }
  const evidenceRoot = path.join(repoRoot, '.tmp/artifacts/T504/windows', match[1]);
  fsApi.mkdirSync(evidenceRoot, { recursive: true });
  for (const name of ['receipt.json', 'action.log', 'connections.jsonl']) {
    await executeScp(scpSpec(host, `${remoteRoot}/${name}`, path.join(evidenceRoot, name)), { env });
  }
  const receipt = JSON.parse(fsApi.readFileSync(path.join(evidenceRoot, 'receipt.json'), 'utf8'));
  if (receipt.runId !== match[1] || receipt.action !== ACTION) throw new Error('Database diagnostic receipt identity mismatch');
  stdout.write(`[windows-dev-control] database diagnostic evidence=${evidenceRoot}\n`);
  if (remoteError) throw Object.assign(remoteError, { evidenceRoot });
  return { action: ACTION, evidenceRoot, receipt };
}
