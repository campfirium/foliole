import fs from 'node:fs';
import path from 'node:path';

const REMOTE_PREFIX = 'C:/dev/foliole-android-lab-preview/.tmp/artifacts/windows-dev-action/';

function parse(output) {
  const match = /^\[windows-dev-action\] sync-group-task3 identity=([A-Za-z0-9.-]{1,96}) manifest=([^\r\n]+)$/mu.exec(output);
  if (!match) throw new Error('Windows C task 3 did not report fixed evidence.');
  const remoteRoot = `${REMOTE_PREFIX}${match[1]}`;
  if (match[2].replaceAll('\\', '/') !== `${remoteRoot}/sync-group-task3-receipt.json`) {
    throw new Error('Windows C task 3 evidence escaped its fixed root.');
  }
  return { identity: match[1], remoteRoot };
}

export async function runWindowsSyncGroupTask3Control({ buildPushSpec, buildScpSpec,
  buildSshSpec, env, executeGit, executeScp, executeSsh, host, repoRoot, stdout }) {
  const push = buildPushSpec(host, env);
  await executeGit(push.args, { env: push.env });
  const output = await executeSsh(buildSshSpec(host, 'sync-group-task3', env), { env });
  stdout.write(output);
  const evidence = parse(output);
  const localRoot = path.join(repoRoot, '.tmp/artifacts/sync-group-task3', evidence.identity);
  fs.mkdirSync(localRoot, { recursive: true });
  for (const name of ['sync-group-task3-receipt.json', 'summary.json']) {
    await executeScp(buildScpSpec(host, `${evidence.remoteRoot}/${name}`,
      path.join(localRoot, name), env), { env });
  }
  return { action: 'sync-group-task3', evidenceRoot: localRoot,
    manifestPath: path.join(localRoot, 'sync-group-task3-receipt.json') };
}
