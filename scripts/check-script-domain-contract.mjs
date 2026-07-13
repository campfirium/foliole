#!/usr/bin/env node
/* global console, process */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CAPABILITY_CONTRACTS,
  EXECUTION_PLACEMENTS,
  LIFECYCLE_DISPOSITIONS,
  SCRIPT_ASSET_INVENTORY_SHA256,
  classifyScriptAsset,
  renderCapabilityCommand
} from './lib/script-domain-registry.mjs';
import { RETIRED_PACKAGE_SCRIPTS, RETIRED_SCRIPT_ASSETS } from './lib/script-domain-retirements.mjs';

function normalizeRelativePath(repoRoot, filePath) {
  return path.relative(repoRoot, filePath).replaceAll(path.sep, '/');
}

function collectFiles(directoryPath) {
  return readdirSync(directoryPath, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directoryPath, entry.name);
    return entry.isDirectory() ? collectFiles(entryPath) : [entryPath];
  });
}

export function collectScriptAssetPaths(repoRoot) {
  const scriptsRoot = path.join(repoRoot, 'scripts');
  return collectFiles(scriptsRoot).map((filePath) => normalizeRelativePath(repoRoot, filePath)).sort();
}

export function hashScriptAssetPaths(paths) {
  return createHash('sha256').update(`${paths.join('\n')}\n`).digest('hex');
}

export function validateScriptAsset(asset) {
  const errors = [];
  if (!asset || !LIFECYCLE_DISPOSITIONS.includes(asset.disposition)) {
    return ['missing or invalid lifecycle disposition'];
  }
  if (asset.placements.length === 0) {
    errors.push('missing execution placement');
  }
  const invalidPlacements = asset.placements.filter((placement) => !EXECUTION_PLACEMENTS.includes(placement));
  if (invalidPlacements.length > 0) {
    errors.push(`unknown execution placement: ${invalidPlacements.join(', ')}`);
  }
  if (asset.disposition === 'confirm' && !asset.confirmReason?.trim()) {
    errors.push('confirm asset requires a reason');
  }
  if (asset.disposition !== 'confirm' && asset.confirmReason) {
    errors.push('confirm reason is only valid for confirm assets');
  }
  return errors;
}

export function validateCapabilities(repoRoot, packageScripts, assetsByPath, contracts = CAPABILITY_CONTRACTS) {
  const violations = [];
  for (const contract of contracts) {
    if (packageScripts[contract.name] !== renderCapabilityCommand(contract)) {
      violations.push(`${contract.name}: package script does not match registered adapter argv`);
    }
    if (!existsSync(path.join(repoRoot, contract.adapterPath))) {
      violations.push(`${contract.name}: adapter file is missing: ${contract.adapterPath}`);
      continue;
    }
    const asset = assetsByPath.get(contract.adapterPath);
    if (!asset || asset.disposition !== 'active') {
      violations.push(`${contract.name}: adapter must reference an active asset`);
      continue;
    }
    const missingPlacements = contract.placements.filter((placement) => !asset.placements.includes(placement));
    if (missingPlacements.length > 0) {
      violations.push(`${contract.name}: adapter is missing placements: ${missingPlacements.join(', ')}`);
    }
  }
  return violations;
}

export function inspectScriptDomainContract({
  expectedInventoryHash = SCRIPT_ASSET_INVENTORY_SHA256,
  repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
} = {}) {
  const paths = collectScriptAssetPaths(repoRoot);
  const inventoryHash = hashScriptAssetPaths(paths);
  const assets = paths.map(classifyScriptAsset);
  const violations = [];
  for (const asset of assets) {
    for (const error of validateScriptAsset(asset)) {
      violations.push(`${asset?.path ?? 'unknown'}: ${error}`);
    }
  }
  for (const retiredPath of RETIRED_SCRIPT_ASSETS) {
    if (assets.some((asset) => asset.path === retiredPath)) {
      violations.push(`${retiredPath}: retired script asset must not exist`);
    }
  }
  if (inventoryHash !== expectedInventoryHash) {
    violations.push(`script asset inventory changed: expected=${expectedInventoryHash} actual=${inventoryHash}`);
  }
  const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  for (const scriptName of RETIRED_PACKAGE_SCRIPTS) {
    if (packageJson.scripts?.[scriptName]) {
      violations.push(`${scriptName}: retired package script must not exist`);
    }
  }
  const assetsByPath = new Map(assets.map((asset) => [asset.path, asset]));
  violations.push(...validateCapabilities(repoRoot, packageJson.scripts ?? {}, assetsByPath));
  return {
    assets,
    confirm: assets.filter((asset) => asset.disposition === 'confirm'),
    inventoryHash,
    ok: violations.length === 0,
    violations
  };
}

function printResult(result) {
  for (const asset of result.confirm) {
    console.log(`[script-domains] confirm ${asset.path}: ${asset.confirmReason}`);
  }
  if (result.ok) {
    console.log(`[script-domains] status: OK assets=${result.assets.length} confirm=${result.confirm.length}`);
    return;
  }
  console.error(`[script-domains] status: FAILED violations=${result.violations.length}`);
  for (const violation of result.violations) {
    console.error(`[script-domains] ${violation}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = inspectScriptDomainContract();
  printResult(result);
  process.exitCode = result.ok ? 0 : 1;
}
