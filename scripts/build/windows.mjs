import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '../..');

export async function buildWindows({ args = process.argv.slice(2), env = process.env, root = ROOT } = {}) {
  if (args.length) {
    throw new Error('build:windows accepts no options; use an explicit packaging or installation command instead.');
  }
  const buildEnv = { ...env };
  for (const key of Object.keys(buildEnv)) {
    if (key.toLowerCase() === 'npm_config_install') delete buildEnv[key];
  }
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'scripts/windows/package-windows.mjs')], {
      cwd: root, env: buildEnv, shell: false, stdio: 'inherit', windowsHide: true
    });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Windows packaging failed: ${signal ?? `exit ${code}`}`));
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  buildWindows().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
