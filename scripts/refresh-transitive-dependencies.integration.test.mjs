// @vitest-environment node
import { execFile as execFileCallback, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, expect, it } from 'vitest';

const execFile = promisify(execFileCallback);
const script = path.resolve('scripts/refresh-transitive-dependencies.mjs');
let fixture;
let server;
afterEach(async () => {
  await new Promise((resolve) => server ? server.close(resolve) : resolve());
  if (fixture) await rm(fixture, { recursive: true, force: true });
});

async function tarball(root, name, version, extra = {}) {
  const directory = path.join(root, `${name}-${version}`);
  await mkdir(path.join(directory, 'package'), { recursive: true });
  const manifest = { name, version, ...extra };
  await writeFile(path.join(directory, 'package/package.json'), JSON.stringify(manifest));
  if (extra.bundleDependencies) {
    await mkdir(path.join(directory, 'package/node_modules/embedded'), { recursive: true });
    await writeFile(path.join(directory, 'package/node_modules/embedded/package.json'),
      JSON.stringify({ name: 'embedded', version: '1.0.0' }));
  }
  const archive = path.join(directory, 'package.tgz');
  execFileSync('tar', ['-czf', archive, '-C', directory, 'package']);
  return { manifest, bytes: await readFile(archive) };
}

it('refreshes bundled registry dependencies while remote URLs and install scripts remain blocked', async () => {
  await mkdir('.tmp/artifacts/T729-19', { recursive: true });
  fixture = await mkdtemp(path.resolve('.tmp/artifacts/T729-19/npm-regression-'));
  const packages = {
    'parent@1.0.0': await tarball(fixture, 'parent', '1.0.0', {
      dependencies: { leaf: '^1.0.0', embedded: '1.0.0' }, bundleDependencies: ['embedded']
    }),
    'leaf@1.0.0': await tarball(fixture, 'leaf', '1.0.0'),
    'leaf@1.1.0': await tarball(fixture, 'leaf', '1.1.0', {
      scripts: { install: 'node -e "process.exit(42)"' }
    })
  };
  let registry;
  server = createServer((request, response) => {
    const name = request.url.slice(1);
    if (name.endsWith('.tgz')) return response.end(packages[name.slice(0, -4)].bytes);
    const versions = Object.values(packages).filter((p) => p.manifest.name === name);
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ name, 'dist-tags': { latest: versions.at(-1)?.manifest.version },
      time: Object.fromEntries(versions.map(({ manifest }) => [manifest.version, '2020-01-01T00:00:00Z'])),
      versions: Object.fromEntries(versions.map(({ manifest }) => [manifest.version,
        { ...manifest, dist: { tarball: `${registry}${name}@${manifest.version}.tgz` } }])) }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  registry = `http://127.0.0.1:${server.address().port}/`;
  const cwd = path.join(fixture, 'project');
  await mkdir(cwd);
  await writeFile(path.join(cwd, '.npmrc'),
    `registry=${registry}\nallow-remote=none\nmin-release-age=7\naudit=false\nfund=false\ncache=${fixture}/cache\n`);
  const manifest = JSON.stringify({ name: 'fixture', version: '1.0.0', dependencies: { parent: '1.0.0' } });
  await writeFile(path.join(cwd, 'package.json'), manifest);
  await writeFile(path.join(cwd, 'package-lock.json'), JSON.stringify({ name: 'fixture', version: '1.0.0',
    lockfileVersion: 3, packages: {
      '': { name: 'fixture', version: '1.0.0', dependencies: { parent: '1.0.0' } },
      'node_modules/parent': { ...packages['parent@1.0.0'].manifest, resolved: `${registry}parent@1.0.0.tgz` },
      'node_modules/leaf': { version: '1.0.0', resolved: `${registry}leaf@1.0.0.tgz` },
      'node_modules/parent/node_modules/embedded': { version: '1.0.0', inBundle: true }
    } }));
  const npm = (args) => execFile('npm', args, { cwd });
  await expect(npm(['update', 'leaf', '--package-lock-only', '--no-save', '--ignore-scripts']))
    .rejects.toMatchObject({ stderr: expect.stringContaining('EALLOWREMOTE') });
  await execFile('node', ['--input-type=module', '-e',
    `import { refreshTransitivePackages } from ${JSON.stringify(script)}; refreshTransitivePackages(['leaf']);`], { cwd });
  const lock = JSON.parse(await readFile(path.join(cwd, 'package-lock.json'), 'utf8'));
  expect(lock.packages['node_modules/leaf'].version).toBe('1.1.0');
  expect(lock.packages['node_modules/parent'].version).toBe('1.0.0');
  expect(JSON.parse(await readFile(path.join(cwd, 'node_modules/leaf/package.json'), 'utf8')).version).toBe('1.1.0');
  expect(await readFile(path.join(cwd, 'package.json'), 'utf8')).toBe(manifest);
  await expect(npm(['install', `${registry}leaf@1.1.0.tgz`, '--no-save', '--ignore-scripts']))
    .rejects.toMatchObject({ stderr: expect.stringContaining('EALLOWREMOTE') });
}, 30_000);
