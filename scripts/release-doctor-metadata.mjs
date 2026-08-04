import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { assertReleaseBodyPresentation } from './release-body-contract.mjs';
import { createCheck } from './release-doctor-core.mjs';
import { validateReleaseNotesRecord } from './release-notes-contract.mjs';

async function checkGithubBody(rootDir, version, identity) {
  const relativePath = `releases/github/v${version}.md`;
  if (!existsSync(join(rootDir, relativePath))) {
    return createCheck('FAIL', 'GitHub release body', `${relativePath} is missing.`);
  }
  const body = await readFile(join(rootDir, relativePath), 'utf8');
  if (!body.trim()) return createCheck('FAIL', 'GitHub release body', `${relativePath} is empty.`);
  if (identity.intent.publicationMode === 'legacy') {
    return createCheck('PASS', 'GitHub release body', `${relativePath} is a frozen legacy body.`);
  }
  try {
    assertReleaseBodyPresentation(body);
    return createCheck('PASS', 'GitHub release body', `${relativePath} contains reviewed public copy.`);
  } catch (error) {
    return createCheck('FAIL', 'GitHub release body', error.message);
  }
}

function checkNotesCatalog(catalog, locale, version, identity) {
  const entry = catalog[version];
  if (!entry) return createCheck('FAIL', `${locale} release notes`, `${locale} catalog has no ${version} entry.`);
  try {
    const normalized = validateReleaseNotesRecord(entry, identity, `${locale} ${version} release notes`);
    const count = normalized.notes.length + Object.values(normalized.platformNotes).flat().length;
    return createCheck('PASS', `${locale} release notes`, `${locale} ${version} notes contain ${count} item(s).`);
  } catch (error) {
    return createCheck('FAIL', `${locale} release notes`, error.message);
  }
}

export async function checkReleaseMetadata({ enNotes, identity, rootDir, version, zhNotes }) {
  return [
    await checkGithubBody(rootDir, version, identity),
    checkNotesCatalog(enNotes, 'en', version, identity),
    checkNotesCatalog(zhNotes, 'zh-Hans', version, identity)
  ];
}
