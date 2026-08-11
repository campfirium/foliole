/* global console, process */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import manifest from '../../lib/core/localization/appLocaleManifest.json' with { type: 'json' };
import protectedLiterals from './protected-literals.json' with { type: 'json' };
import semanticConflicts from './semantic-conflicts.json' with { type: 'json' };
import { loadSourceDomains } from './catalog-source.mjs';
import { compareEntry, sourceConflicts } from './catalog-contract.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const generatedLocales = Object.keys(manifest.locales).filter((locale) => !['en', 'zh-Hans'].includes(locale));

async function checkLocale(locale, domains) {
  const problems = [];
  for (const { domain, en } of domains) {
    const filePath = path.join(repoRoot, 'src/shared/localization/locales', localeDirectory(locale), `${domain}.json`);
    const translated = JSON.parse(await fs.readFile(filePath, 'utf8'));
    const enKeys = Object.keys(en).sort();
    const translatedKeys = Object.keys(translated).sort();
    if (JSON.stringify(enKeys) !== JSON.stringify(translatedKeys)) {
      problems.push(`${locale}/${domain}: keys differ from English`);
      continue;
    }
    for (const key of enKeys) {
      problems.push(...compareEntry(`${locale}/${key}`, en[key], translated[key], protectedLiterals));
    }
  }
  return problems;
}

function localeDirectory(locale) {
  return locale === 'pt-BR' ? 'ptBR' : locale;
}

export async function checkAllLocales() {
  const domains = await loadSourceDomains(repoRoot);
  const problems = sourceConflicts(domains, protectedLiterals, semanticConflicts);
  for (const locale of generatedLocales) problems.push(...await checkLocale(locale, domains));
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = await checkAllLocales();
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`Localization contract passed for ${Object.keys(manifest.locales).length} locales.`);
  }
}
