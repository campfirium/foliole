#!/usr/bin/env node
/* global console, process */

import { spawnSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

export function collectSignatureTargets(rootPath, extensions, recursive) {
  const normalizedExtensions = new Set(extensions.map((extension) => `.${extension.replace(/^\./u, '').toLowerCase()}`));
  const targets = [];
  const visit = (candidatePath) => {
    const stats = statSync(candidatePath);
    if (stats.isFile()) {
      if (normalizedExtensions.has(path.extname(candidatePath).toLowerCase())) targets.push(path.resolve(candidatePath));
      return;
    }
    for (const entry of readdirSync(candidatePath, { withFileTypes: true })) {
      if (entry.isDirectory() && !recursive) continue;
      visit(path.join(candidatePath, entry.name));
    }
  };
  visit(rootPath);
  return targets.sort();
}

function quotePowerShell(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

export function buildSignatureVerificationScript(files) {
  const fileList = files.map(quotePowerShell).join(',\n  ');
  return `$ErrorActionPreference = 'Stop'
$files = @(
  ${fileList}
)
$failures = @()
foreach ($file in $files) {
  $signature = Get-AuthenticodeSignature -LiteralPath $file
  if ($signature.Status -ne [System.Management.Automation.SignatureStatus]::Valid) {
    $failures += "$file [$($signature.Status)] $($signature.StatusMessage)"
    continue
  }
  Write-Host "SIGNATURE_VALID $file [$($signature.SignerCertificate.Thumbprint)]"
}
if ($failures.Count -gt 0) {
  $failures | ForEach-Object { Write-Error $_ }
  exit 1
}
Write-Host "SIGNATURES_VALID count=$($files.Count)"
`;
}

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function main() {
  if (process.platform !== 'win32') throw new Error('Authenticode verification requires Windows');
  const root = readArgument('--root');
  if (!root) throw new Error('--root is required');
  const extensions = (readArgument('--extensions') ?? 'exe,dll').split(',').filter(Boolean);
  const files = collectSignatureTargets(root, extensions, process.argv.includes('--recursive'));
  if (!files.length) throw new Error(`No signature targets found under ${root}`);
  const encoded = Buffer.from(buildSignatureVerificationScript(files), 'utf16le').toString('base64');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-EncodedCommand', encoded], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Authenticode verification failed with exit code ${result.status}`);
}

if (process.argv[1] && process.argv[1].endsWith('verify-artifact-signatures.mjs')) {
  try {
    main();
  } catch (error) {
    console.error(`[verify-artifact-signatures] status: FAILED reason=${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
