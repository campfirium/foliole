import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '../..');
const PACKAGER = `import { appendFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
const install = args.includes('--install') || args.includes('--install-existing')
  || process.env.npm_config_install === 'true' || process.env.NPM_CONFIG_INSTALL === 'true';
writeFileSync('package-call.json', JSON.stringify({ args, install,
  lower: process.env.npm_config_install, upper: process.env.NPM_CONFIG_INSTALL }));
appendFileSync('package-calls.jsonl', JSON.stringify({ args, install }) + '\\n');
if (install) writeFileSync('installed.txt', 'unexpected installation');
if (process.env.FIXTURE_PACKAGE_EXIT) process.exit(Number(process.env.FIXTURE_PACKAGE_EXIT));
console.log('PACKAGED');
`;

export function windowsCliFixture() {
  const parent = path.join(ROOT, '.tmp/artifacts/T704');
  mkdirSync(parent, { recursive: true });
  const root = realpathSync(mkdtempSync(path.join(parent, 'windows source build ')));
  mkdirSync(path.join(root, 'scripts/build'), { recursive: true });
  mkdirSync(path.join(root, 'scripts/windows'), { recursive: true });
  const source = path.join(ROOT, 'scripts/build/windows.mjs');
  if (existsSync(source)) copyFileSync(source, path.join(root, 'scripts/build/windows.mjs'));
  writeFileSync(path.join(root, 'scripts/windows/package-windows.mjs'), PACKAGER);
  const { scripts } = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ type: 'module', scripts: {
    'build:windows': scripts['build:windows'], 'windows:package': scripts['windows:package'],
    'windows:package:install': scripts['windows:package:install']
  } }));
  return { root,
    installed: () => existsSync(path.join(root, 'installed.txt')),
    call: () => existsSync(path.join(root, 'package-call.json'))
      ? JSON.parse(readFileSync(path.join(root, 'package-call.json'), 'utf8')) : null,
    calls: () => existsSync(path.join(root, 'package-calls.jsonl'))
      ? readFileSync(path.join(root, 'package-calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse) : [],
    run(args = [], extraEnv = {}, script = 'build:windows') {
      const env = { ...process.env };
      for (const key of Object.keys(env)) if (key.toLowerCase() === 'npm_config_install') delete env[key];
      return spawnSync(process.execPath, [process.env.npm_execpath, 'run', script, '--', ...args], {
        cwd: root, env: { ...env, ...extraEnv }, encoding: 'utf8', timeout: 20_000
      });
    }
  };
}
