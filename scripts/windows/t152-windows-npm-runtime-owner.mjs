#!/usr/bin/env node
/* global process, URL */

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

function digest(value) { return createHash('sha256').update(value).digest('hex'); }

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function canonicalPath(value, label) {
  if (!path.win32.isAbsolute(value ?? '') || !fs.statSync(value).isFile()) {
    throw new Error(`${label} must be an existing absolute file`);
  }
  const resolved = fs.realpathSync(value);
  if (path.win32.normalize(value).toLowerCase() !== path.win32.normalize(resolved).toLowerCase()) {
    throw new Error(`${label} must already be canonical`);
  }
  return resolved;
}

function contains(root, value) {
  const relative = path.win32.relative(root, value);
  return relative !== '' && !relative.startsWith('..') && !path.win32.isAbsolute(relative);
}

function identity(value) {
  return { path: value, sha256: digest(fs.readFileSync(value)) };
}

export function resolveNpmManifestEntry({ canonicalFile = canonicalPath, installationRoot,
  manifestPath, metadata }) {
  if (metadata.name !== 'npm' || typeof metadata.version !== 'string' || !metadata.version
      || typeof metadata.bin?.npm !== 'string' || !metadata.bin.npm) {
    throw new Error('npm manifest identity or bin.npm is invalid');
  }
  const cli = canonicalFile(path.win32.resolve(path.win32.dirname(manifestPath), metadata.bin.npm),
    'npm CLI path');
  if (!contains(installationRoot, cli) || !contains(path.win32.dirname(manifestPath), cli)) {
    throw new Error('npm CLI escapes its installation distribution');
  }
  return cli;
}

export function resolveNpmRuntimeOwner({ nodePath, npmCommandPath }) {
  const node = canonicalPath(nodePath, 'node path');
  const npmCommand = canonicalPath(npmCommandPath, 'npm command path');
  const installationRoot = path.win32.dirname(node);
  if (path.win32.dirname(npmCommand).toLowerCase() !== installationRoot.toLowerCase()) {
    throw new Error('node and npm command must share one installation root');
  }
  const resolve = createRequire(path.win32.join(installationRoot, '__t152_npm_owner__.cjs'));
  const manifest = canonicalPath(resolve.resolve('npm/package.json'), 'npm manifest path');
  if (!contains(installationRoot, manifest)) throw new Error('npm manifest escapes installation root');
  const metadata = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  const cli = resolveNpmManifestEntry({ installationRoot, manifestPath: manifest, metadata });
  const receipt = { fileIdentities: { nodePath: identity(node), npmCliPath: identity(cli),
    npmCommandPath: identity(npmCommand), npmManifestPath: identity(manifest) },
  installationRoot, nodePath: node, npmCliPath: cli, npmCommandPath: npmCommand,
  npmManifestPath: manifest, packageName: metadata.name, packageVersion: metadata.version,
  schemaVersion: 1 };
  return { ...receipt, ownerSha256: digest(JSON.stringify(canonical(receipt))) };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url))) {
  const values = Object.fromEntries(process.argv.slice(2).reduce((items, value, index, all) => {
    if (index % 2 === 0) items.push([value, all[index + 1]]);
    return items;
  }, []));
  process.stdout.write(`T152_NPM_RUNTIME_OWNER=${JSON.stringify(resolveNpmRuntimeOwner({
    nodePath: values['--node-path'], npmCommandPath: values['--npm-command-path'] }))}\n`);
}
