#!/usr/bin/env node
/* global console, process */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import ts from 'typescript';

import {
  WINDOWS_VALIDATION_ALLOWED_BARE_IMPORTS,
  WINDOWS_VALIDATION_EXTRA_ASSETS,
  WINDOWS_VALIDATION_KIT_SCHEMA_VERSION,
  WINDOWS_VALIDATION_PHYSICAL_SPECS,
  WINDOWS_VALIDATION_REQUIRED_NODE_MAJOR,
  WINDOWS_VALIDATION_RUNTIME_PACKAGES,
  WINDOWS_VALIDATION_SOURCE_ENTRIES
} from './windows-validation-kit-profile.mjs';
import {
  listKitFiles,
  sha256File,
  verifyWindowsValidationKit
} from './windows-validation-kit-verify.mjs';

const RESOLUTION_SUFFIXES = ['', '.ts', '.tsx', '.mjs', '.js'];

function importSpecifiers(source, fileName) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const specifiers = [];
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      specifiers.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const value = node.arguments[0];
      if (!value || !ts.isStringLiteral(value)) throw new Error(`dynamic import must use a literal: ${fileName}`);
      specifiers.push(value.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return specifiers;
}

function resolveLocalImport(repoRoot, importer, specifier) {
  const unresolved = path.resolve(repoRoot, path.dirname(importer), specifier);
  const candidates = RESOLUTION_SUFFIXES.flatMap((suffix) => [
    `${unresolved}${suffix}`,
    path.join(unresolved, `index${suffix}`)
  ]);
  const match = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!match) throw new Error(`unresolved validation-kit import: ${importer} -> ${specifier}`);
  return path.relative(repoRoot, match).replaceAll(path.sep, '/');
}

export function collectValidationSourceClosure(repoRoot, entries = WINDOWS_VALIDATION_SOURCE_ENTRIES) {
  const pending = [...entries];
  const collected = new Set();
  while (pending.length > 0) {
    const file = pending.shift();
    if (collected.has(file)) continue;
    const filePath = path.join(repoRoot, file);
    if (!fs.existsSync(filePath)) throw new Error(`missing validation-kit source: ${file}`);
    collected.add(file);
    for (const specifier of importSpecifiers(fs.readFileSync(filePath, 'utf8'), file)) {
      if (specifier.startsWith('.')) pending.push(resolveLocalImport(repoRoot, file, specifier));
      else if (!specifier.startsWith('node:') && !WINDOWS_VALIDATION_ALLOWED_BARE_IMPORTS.has(specifier)) {
        throw new Error(`unsupported validation-kit bare import: ${file} -> ${specifier}`);
      }
    }
  }
  return [...collected].sort();
}

function assertNoSymbolicLinks(rootDir) {
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`symbolic link is forbidden in validation runtime: ${entryPath}`);
    if (entry.isDirectory()) assertNoSymbolicLinks(entryPath);
  }
}

function copyRelativeFile(repoRoot, kitRoot, relativePath) {
  const source = path.join(repoRoot, relativePath);
  if (fs.lstatSync(source).isSymbolicLink()) throw new Error(`symbolic link is forbidden: ${relativePath}`);
  const destination = path.join(kitRoot, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function copyRuntimePackages(repoRoot, kitRoot) {
  return Object.fromEntries(WINDOWS_VALIDATION_RUNTIME_PACKAGES.map((packageName) => {
    const source = path.join(repoRoot, 'node_modules', packageName);
    assertNoSymbolicLinks(source);
    const destination = path.join(kitRoot, 'node_modules', packageName);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(source, destination, { recursive: true });
    const version = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8')).version;
    return [packageName, version];
  }));
}

function readInstallerChecksum(artifactRoot) {
  const checksumPath = path.join(artifactRoot, 'SHA256SUMS.txt');
  const lines = fs.readFileSync(checksumPath, 'utf8').trim().split(/\r?\n/u).filter(Boolean);
  if (lines.length !== 1) throw new Error('SHA256SUMS.txt must contain exactly one installer');
  const match = lines[0].match(/^([0-9a-f]{64}) \*([^\\/]+\.exe)$/u);
  if (!match) throw new Error('invalid Windows installer checksum record');
  const installerPath = path.join(artifactRoot, match[2]);
  if (sha256File(installerPath) !== match[1]) throw new Error('installer checksum file does not match installer');
  return { fileName: match[2], sha256: match[1] };
}

function requiredEnv(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required to build the validation kit`);
  return value;
}

function actualHead(repoRoot) {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
}

export function buildWindowsValidationKit({
  env = process.env,
  head = actualHead,
  outputRoot,
  repoRoot = process.cwd()
} = {}) {
  const artifactRoot = path.resolve(outputRoot || path.join(repoRoot, 'artifacts/windows'));
  const kitRoot = path.join(artifactRoot, 'validation-kit');
  fs.rmSync(kitRoot, { force: true, recursive: true });
  fs.mkdirSync(kitRoot, { recursive: true });
  const sources = collectValidationSourceClosure(repoRoot);
  for (const file of [...sources, ...WINDOWS_VALIDATION_EXTRA_ASSETS]) copyRelativeFile(repoRoot, kitRoot, file);
  const runtimePackages = copyRuntimePackages(repoRoot, kitRoot);
  fs.writeFileSync(path.join(kitRoot, 'package.json'), `${JSON.stringify({ private: true, type: 'module' }, null, 2)}\n`);
  const installer = readInstallerChecksum(artifactRoot);
  const commitSha = head(repoRoot);
  if (!/^[0-9a-f]{40}$/u.test(commitSha)) throw new Error('actual checkout HEAD must be a lowercase 40-character SHA');
  const files = listKitFiles(kitRoot).map((file) => ({ path: file, sha256: sha256File(path.join(kitRoot, file)) }));
  const manifest = {
    appVersion: JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version,
    commitSha,
    files,
    generatedAt: new Date().toISOString(),
    generatedWithNodeVersion: process.versions.node,
    installer: { path: installer.fileName, sha256: installer.sha256 },
    physicalSpecs: WINDOWS_VALIDATION_PHYSICAL_SPECS,
    requiredNodeMajor: WINDOWS_VALIDATION_REQUIRED_NODE_MAJOR,
    runAttempt: requiredEnv(env, 'GITHUB_RUN_ATTEMPT'),
    runId: requiredEnv(env, 'GITHUB_RUN_ID'),
    runtimePackages,
    schemaVersion: WINDOWS_VALIDATION_KIT_SCHEMA_VERSION,
    sourceFiles: sources
  };
  fs.writeFileSync(path.join(kitRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  verifyWindowsValidationKit({
    expected: { commitSha, runAttempt: manifest.runAttempt, runId: manifest.runId },
    kitRoot
  });
  return { kitRoot, manifest };
}

function parseCli(argv) {
  const command = argv[0];
  if (command !== 'build') throw new Error('Usage: node windows-validation-kit-build.mjs build');
  return command;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    parseCli(process.argv.slice(2));
    const { kitRoot, manifest } = buildWindowsValidationKit();
    console.log(`[windows-validation-kit-build] status: OK commit=${manifest.commitSha} kit=${kitRoot}`);
  } catch (error) {
    console.error(`[windows-validation-kit-build] ${error.message}`);
    process.exitCode = 1;
  }
}
