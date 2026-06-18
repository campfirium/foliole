#!/usr/bin/env node
/* global console, process */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EN_HEADINGS = new Set(['New', 'Improved', 'Fixed', 'Changed']);
const ZH_HEADINGS = new Set(['新增', '优化', '修复', '变更']);
const DEFAULT_RELEASE_COPY_OUT_DIR = 'artifacts/windows';

function parseArgs(argv) {
  const args = { out: DEFAULT_RELEASE_COPY_OUT_DIR, version: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--version') {
      args.version = argv[++index] ?? '';
    } else if (arg === '--out') {
      args.out = argv[++index] ?? '';
    } else if (arg === '--help') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function notesForVersion(locale, version) {
  const catalog = readJson(path.join('releases', 'notes', `${locale}.json`));
  const entry = catalog[version];
  if (!entry?.notes?.length) {
    throw new Error(`Missing release notes for ${locale} ${version}.`);
  }
  return entry.notes;
}

function splitSections(notes, headings) {
  const sections = [];
  let current = null;
  for (const item of notes) {
    if (headings.has(item)) {
      current = { heading: item, items: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { heading: '', items: [] };
      sections.push(current);
    }
    current.items.push(item);
  }
  return sections.filter((section) => section.items.length > 0);
}

export function formatGithubBody(notes) {
  const sections = splitSections(notes, EN_HEADINGS);
  return [
    ...sections.flatMap((section) => [
      section.heading ? `### ${section.heading}` : '### Changes',
      ...section.items.map((item) => `- ${item}`),
      ''
    ])
  ].join('\n').trimEnd() + '\n';
}

export function formatExternalAnnouncement({ enNotes, version, zhNotes }) {
  const zhSections = splitSections(zhNotes, ZH_HEADINGS);
  const enSections = splitSections(enNotes, EN_HEADINGS);
  const englishShortCopy = enSections
    .flatMap((section) => section.items)
    .slice(0, 3)
    .map((item) => `- ${item}`);

  return [
    `## 更新 v${version}`,
    '',
    ...zhSections.flatMap((section) => [
      section.heading ? `### ${section.heading}` : '### 更新',
      ...section.items.map((item) => `- ${item}`),
      ''
    ]),
    '---',
    '',
    '## English Short Copy',
    '',
    `Foliole v${version} for Windows is available.`,
    ...englishShortCopy,
    ''
  ].join('\n');
}

export function writeReleaseCopySurfaces({ outDir, version }) {
  const enNotes = notesForVersion('en', version);
  const zhNotes = notesForVersion('zh-Hans', version);
  fs.mkdirSync(outDir, { recursive: true });

  const githubBodyPath = path.join(outDir, `release-v${version}-github-body.md`);
  const announcementPath = path.join(outDir, `foliole-v${version}-announcement.md`);
  fs.writeFileSync(githubBodyPath, formatGithubBody(enNotes), 'utf8');
  fs.writeFileSync(announcementPath, formatExternalAnnouncement({ enNotes, version, zhNotes }), 'utf8');
  return { announcementPath, githubBodyPath };
}

function printHelp() {
  console.log(`Usage: node scripts/release-copy-surfaces.mjs --version x.y.z [--out ${DEFAULT_RELEASE_COPY_OUT_DIR}]`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      printHelp();
    } else if (!args.version) {
      throw new Error('Expected --version x.y.z.');
    } else {
      const result = writeReleaseCopySurfaces({ outDir: args.out, version: args.version });
      console.log(`[release-copy] github_body=${result.githubBodyPath}`);
      console.log(`[release-copy] announcement=${result.announcementPath}`);
    }
  } catch (error) {
    console.error(`[release-copy] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
