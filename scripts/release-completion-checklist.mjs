#!/usr/bin/env node
/* global console, process */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RELEASE_COMPLETION_ITEMS = [
  ['releaseGatesPassed', 'release gates passed'],
  ['localInstallerPackagedAndSilentInstalled', 'local installer packaged and silent-installed'],
  ['candidateCommitPushed', 'release candidate commit pushed'],
  ['githubReleasePublic', 'GitHub release is public'],
  ['githubReleaseBodyContainsApprovedNotes', 'GitHub release body contains approved notes'],
  ['installerAssetExists', 'installer asset exists'],
  ['sha256AssetExists', 'SHA256 asset exists'],
  ['updateManifestPublicLatest', 'update manifest public URL reports latest version'],
  ['externalAnnouncementMarkdownExists', 'external announcement Markdown exists']
];
const DEFAULT_RELEASE_ARTIFACTS_DIR = 'release-artifacts';
const ATTESTATION_DETAIL = 'attested by release evidence; script does not independently query public URLs';

function parseArgs(argv) {
  const args = { artifactsDir: DEFAULT_RELEASE_ARTIFACTS_DIR, evidence: '', version: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--version') {
      args.version = argv[++index] ?? '';
    } else if (arg === '--evidence') {
      args.evidence = argv[++index] ?? '';
    } else if (arg === '--artifacts-dir') {
      args.artifactsDir = argv[++index] ?? '';
    } else if (arg === '--help') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function readEvidence(filePath) {
  if (!filePath) {
    return {};
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function localEvidence(version, artifactsDir = DEFAULT_RELEASE_ARTIFACTS_DIR) {
  if (!version) {
    return {};
  }
  return {
    externalAnnouncementMarkdownExists: fs.existsSync(
      path.join(artifactsDir, `foliole-v${version}-announcement.md`)
    )
  };
}

export function buildReleaseCompletionChecklist({ artifactsDir = DEFAULT_RELEASE_ARTIFACTS_DIR, evidence = {}, version = '' } = {}) {
  const mergedEvidence = { ...localEvidence(version, artifactsDir), ...evidence };
  return RELEASE_COMPLETION_ITEMS.map(([key, label]) => ({
    key,
    label,
    ok: mergedEvidence[key] === true,
    detail: mergedEvidence[`${key}Detail`] ?? (mergedEvidence[key] === true ? ATTESTATION_DETAIL : '')
  }));
}

export function formatReleaseCompletionChecklist(checklist) {
  return checklist
    .map((item) => `${item.ok ? '[x]' : '[ ]'} ${item.label}${item.detail ? ` - ${item.detail}` : ''}`)
    .join('\n');
}

export function assertReleaseComplete(checklist) {
  const missing = checklist.filter((item) => !item.ok);
  if (missing.length > 0) {
    throw new Error(`Release completion checklist has missing items: ${missing.map((item) => item.label).join(', ')}`);
  }
  return true;
}

function printHelp() {
  console.log(
    `Usage: node scripts/release-completion-checklist.mjs --version x.y.z --evidence release-evidence.json [--artifacts-dir ${DEFAULT_RELEASE_ARTIFACTS_DIR}]`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      printHelp();
    } else {
      const checklist = buildReleaseCompletionChecklist({
        artifactsDir: args.artifactsDir,
        evidence: readEvidence(args.evidence),
        version: args.version
      });
      console.log(formatReleaseCompletionChecklist(checklist));
      assertReleaseComplete(checklist);
    }
  } catch (error) {
    console.error(`[release-completion] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
