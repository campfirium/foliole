#!/usr/bin/env node
/* global console, process */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function packageNameFromPath(packagePath) {
  const parts = packagePath.split('/');
  const index = parts.lastIndexOf('node_modules');
  if (index < 0) return null;
  const name = parts[index + 1];
  if (!name) return null;
  return name.startsWith('@') ? `${name}/${parts[index + 2] ?? ''}` : name;
}

function classifyLicense(license) {
  if (typeof license !== 'string' || !license.trim()) return 'missing-license';
  const normalized = license.trim();
  if (/^UNLICENSED$/iu.test(normalized)) return 'unlicensed';
  if (/^Unlicense$/iu.test(normalized)) return 'unlicense';
  const upper = normalized.toUpperCase();
  const hasGpl = /\b(?:A?GPL|LGPL)-?\d/u.test(upper);
  if (!hasGpl) return 'declared';
  const hasPermissiveOption = /\b(?:MIT|APACHE|BSD|ISC|MPL|UNLICENSE)\b/u.test(upper);
  return hasPermissiveOption && /\bOR\b/u.test(upper) ? 'dual-license-with-gpl' : 'gpl-family';
}

function directDependencyNames(rootPackage) {
  return new Set([
    ...Object.keys(rootPackage.dependencies ?? {}),
    ...Object.keys(rootPackage.devDependencies ?? {}),
    ...Object.keys(rootPackage.optionalDependencies ?? {}),
    ...Object.keys(rootPackage.peerDependencies ?? {})
  ]);
}

function inspectDependencyInventory(lockfile) {
  const rootPackage = lockfile.packages?.[''] ?? {};
  const directNames = directDependencyNames(rootPackage);
  const entries = [];

  for (const [packagePath, packageEntry] of Object.entries(lockfile.packages ?? {})) {
    if (!packagePath) continue;
    const name = packageNameFromPath(packagePath);
    if (!name) continue;
    const direct = directNames.has(name) && packagePath === `node_modules/${name}`;
    entries.push({
      deprecated: typeof packageEntry.deprecated === 'string' ? packageEntry.deprecated : null,
      direct,
      license: packageEntry.license ?? null,
      licenseClass: classifyLicense(packageEntry.license),
      name,
      packagePath,
      version: packageEntry.version ?? null
    });
  }

  return {
    deprecated: entries.filter((entry) => entry.deprecated),
    license: {
      dualLicenseWithGpl: entries.filter((entry) => entry.licenseClass === 'dual-license-with-gpl'),
      gplFamily: entries.filter((entry) => entry.licenseClass === 'gpl-family'),
      missingLicense: entries.filter((entry) => entry.licenseClass === 'missing-license'),
      unlicensed: entries.filter((entry) => entry.licenseClass === 'unlicensed'),
      unlicense: entries.filter((entry) => entry.licenseClass === 'unlicense')
    },
    total: entries.length
  };
}

function summarizeEntries(entries) {
  return entries.map((entry) =>
    `${entry.direct ? 'direct' : 'transitive'} ${entry.name}@${entry.version ?? 'unknown'} ${entry.packagePath}`
  );
}

function printInventory(inventory) {
  console.log(`[dependency-inventory] total=${inventory.total}`);
  for (const [label, entries] of Object.entries(inventory.license)) {
    console.log(`[dependency-inventory] license.${label}=${entries.length}`);
    for (const line of summarizeEntries(entries)) console.log(`  ${line}`);
  }
  console.log(`[dependency-inventory] deprecated=${inventory.deprecated.length}`);
  for (const line of summarizeEntries(inventory.deprecated)) console.log(`  ${line}`);
}

function main() {
  const lockPath = process.argv[2] ?? path.join(REPO_ROOT, 'package-lock.json');
  const inventory = inspectDependencyInventory(JSON.parse(readFileSync(lockPath, 'utf8')));
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(inventory, null, 2));
    return;
  }
  printInventory(inventory);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { classifyLicense, inspectDependencyInventory };
