import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const require = createRequire(path.join(root, 'package.json'));
const tar = require('tar');
const upstream = path.resolve(process.argv[2]);
const expected = 'j9ETcBGJaXxAY/b6UBpR7LZfjdU4BAO+yvr4ifqHEdyuc3UNCy91PDGkWKY5UQ4coHNYfnwFggrqD6QPeFGAlg==';
if (createHash('sha512').update(fs.readFileSync(upstream)).digest('base64') !== expected) {
  throw new Error('Expected the verified electron-winstaller 5.4.4 registry tarball');
}
const parent = path.join(root, '.tmp/artifacts/winstaller-repack');
fs.mkdirSync(parent, { recursive: true });
const staging = fs.mkdtempSync(path.join(parent, 'package-'));
try {
  await tar.x({ file: upstream, cwd: staging, strip: 1 });
  const manifestPath = path.join(staging, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.version = '5.4.4-foliole.1';
  manifest.dependencies.glob = '14.0.3';
  manifest.dependencies.minimatch = '11.0.3';
  delete manifest.dependencies.temp;
  delete manifest.devDependencies['@types/temp'];
  // The registry artifact has no TypeScript sources; build happens before packing.
  delete manifest.scripts.prepare;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  for (const [source, destination] of [
    ['temp-utils.cjs', 'lib/temp-utils.js'],
    ['cleanup-patterns.cjs', 'lib/cleanup-patterns.cjs'],
    ['temp-utils.d.ts', 'lib/temp-utils.d.ts']
  ]) fs.copyFileSync(path.join(here, source), path.join(staging, destination));
  fs.rmSync(path.join(staging, 'lib/temp-utils.js.map'), { force: true });
  execFileSync('npm', ['pack', '--ignore-scripts', '--pack-destination', here], {
    cwd: staging, stdio: 'inherit'
  });
} finally {
  fs.rmSync(staging, { recursive: true, force: true });
}
