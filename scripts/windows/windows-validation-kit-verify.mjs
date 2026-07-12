import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  WINDOWS_VALIDATION_KIT_SCHEMA_VERSION,
  WINDOWS_VALIDATION_PHYSICAL_SPECS,
  WINDOWS_VALIDATION_REQUIRED_NODE_MAJOR,
  WINDOWS_VALIDATION_RUNTIME_PACKAGES
} from './windows-validation-kit-profile.mjs';

export function sha256File(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function collectFiles(rootDir, currentDir = rootDir) {
  return fs.readdirSync(currentDir, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(currentDir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`symbolic link is forbidden: ${filePath}`);
    if (entry.isDirectory()) return collectFiles(rootDir, filePath);
    return [path.relative(rootDir, filePath).replaceAll(path.sep, '/')];
  });
}

function assertExpectedIdentity(manifest, expected) {
  for (const [field, value] of [
    ['commitSha', expected.commitSha],
    ['runId', expected.runId],
    ['runAttempt', expected.runAttempt]
  ]) {
    if (!value || String(manifest[field]) !== String(value)) {
      throw new Error(`validation identity mismatch: ${field}`);
    }
  }
}

function resolveArtifactFile(kitRoot, relativePath) {
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.split(/[\\/]/u).includes('..')) {
    throw new Error(`invalid artifact relative path: ${relativePath}`);
  }
  const artifactRoot = path.dirname(kitRoot);
  const filePath = path.resolve(artifactRoot, relativePath);
  if (!filePath.startsWith(`${path.resolve(artifactRoot)}${path.sep}`)) throw new Error('artifact path escaped root');
  if (fs.lstatSync(filePath).isSymbolicLink()) throw new Error('artifact symbolic link is forbidden');
  return filePath;
}

export function verifyWindowsValidationKit({
  expected,
  kitRoot,
  nodeVersion = process.versions.node
}) {
  const manifestPath = path.join(kitRoot, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.schemaVersion !== WINDOWS_VALIDATION_KIT_SCHEMA_VERSION) throw new Error('unsupported validation manifest schema');
  if (manifest.requiredNodeMajor !== WINDOWS_VALIDATION_REQUIRED_NODE_MAJOR) throw new Error('validation manifest Node contract mismatch');
  if (JSON.stringify(manifest.physicalSpecs) !== JSON.stringify(WINDOWS_VALIDATION_PHYSICAL_SPECS)) {
    throw new Error('validation manifest physical spec contract mismatch');
  }
  for (const packageName of WINDOWS_VALIDATION_RUNTIME_PACKAGES) {
    const packageVersion = JSON.parse(fs.readFileSync(path.join(kitRoot, 'node_modules', packageName, 'package.json'), 'utf8')).version;
    if (!manifest.runtimePackages?.[packageName] || manifest.runtimePackages[packageName] !== packageVersion) {
      throw new Error(`validation runtime package mismatch: ${packageName}`);
    }
  }
  if (Number.parseInt(nodeVersion.split('.')[0], 10) !== WINDOWS_VALIDATION_REQUIRED_NODE_MAJOR) {
    const error = new Error(`Node ${WINDOWS_VALIDATION_REQUIRED_NODE_MAJOR} is required`);
    error.code = 'node_version_mismatch';
    throw error;
  }
  assertExpectedIdentity(manifest, expected);
  const actualFiles = collectFiles(kitRoot).filter((file) => file !== 'manifest.json').sort();
  const expectedFiles = manifest.files.map((entry) => entry.path).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) throw new Error('validation kit file inventory mismatch');
  for (const entry of manifest.files) {
    if (sha256File(path.join(kitRoot, entry.path)) !== entry.sha256) throw new Error(`validation kit hash mismatch: ${entry.path}`);
  }
  const installerPath = resolveArtifactFile(kitRoot, manifest.installer.path);
  if (sha256File(installerPath) !== manifest.installer.sha256) throw new Error('installer hash mismatch');
  return { installerPath, manifest };
}

export function listKitFiles(kitRoot) {
  return collectFiles(kitRoot).filter((file) => file !== 'manifest.json').sort();
}
