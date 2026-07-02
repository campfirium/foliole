/* global console, process */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EN_HEADINGS = new Set(['New', 'Improved', 'Fixed', 'Changed']);
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

export function writeReleaseCopySurfaces({ outDir, version }) {
  const enNotes = notesForVersion('en', version);
  fs.mkdirSync(outDir, { recursive: true });

  const githubBodyPath = path.join(outDir, `release-v${version}-github-body.md`);
  fs.writeFileSync(githubBodyPath, formatGithubBody(enNotes), 'utf8');
  return { githubBodyPath };
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
    }
  } catch (error) {
    console.error(`[release-copy] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
