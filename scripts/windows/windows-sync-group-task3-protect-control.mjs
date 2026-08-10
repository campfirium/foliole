import fs from 'node:fs';
import path from 'node:path';

const PREFIX = 'C:/dev/foliole-android-lab-preview/.tmp/artifacts/windows-dev-action/';

export async function runWindowsSyncGroupTask3ProtectControl({ buildPushSpec, buildScpSpec,
  buildSshSpec, env, executeGit, executeScp, executeSsh, host, repoRoot, stdout }) {
  const push = buildPushSpec(host, env);
  await executeGit(push.args, { env: push.env });
  const output = await executeSsh(buildSshSpec(host, 'sync-group-task3-protect', env), { env });
  stdout.write(output);
  const match = /^\[windows-dev-action\] sync-group-task3-protect identity=([A-Za-z0-9.-]{1,96}) manifest=([^\r\n]+)$/mu.exec(output);
  if (!match) throw new Error('Windows C task 3 protection did not report fixed evidence.');
  const remoteRoot = `${PREFIX}${match[1]}`;
  if (match[2].replaceAll('\\', '/') !== `${remoteRoot}/sync-group-task3-protection.json`) {
    throw new Error('Windows C task 3 protection evidence escaped its fixed root.');
  }
  const localRoot = path.join(repoRoot, '.tmp/artifacts/sync-group-task3-protection', match[1]);
  fs.mkdirSync(localRoot, { recursive: true });
  for (const name of ['sync-group-task3-protection.json', 'summary.json']) {
    await executeScp(buildScpSpec(host, `${remoteRoot}/${name}`,
      path.join(localRoot, name), env), { env });
  }
  return { action: 'sync-group-task3-protect', evidenceRoot: localRoot,
    manifestPath: path.join(localRoot, 'sync-group-task3-protection.json') };
}
