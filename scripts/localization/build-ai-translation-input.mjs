/* global console */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import manifest from '../../lib/core/localization/appLocaleManifest.json' with { type: 'json' };
import protectedLiterals from './protected-literals.json' with { type: 'json' };
import semanticConflicts from './semantic-conflicts.json' with { type: 'json' };
import { loadSourceDomains } from './catalog-source.mjs';
import { protectedOccurrences, sourceConflicts } from './catalog-contract.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outputRoot = path.join(repoRoot, '.tmp/artifacts/localization-ai-input');

function surfaceRole(key) {
  return key.split('.', 1)[0];
}

async function buildLocaleInput(locale, domains) {
  const localeRoot = path.join(outputRoot, locale);
  await fs.mkdir(localeRoot, { recursive: true });
  for (const { domain, en, zh } of domains) {
    const records = Object.entries(en).map(([key, english]) => ({
      key,
      english,
      simplifiedChinese: zh[key],
      domain,
      surfaceRole: surfaceRole(key),
      protectedLiterals: protectedOccurrences(english, protectedLiterals)
    }));
    await fs.writeFile(path.join(localeRoot, `${domain}.jsonl`), `${records.map(JSON.stringify).join('\n')}\n`);
  }
}

const domains = await loadSourceDomains(repoRoot);
const conflicts = sourceConflicts(domains, protectedLiterals, semanticConflicts);
if (conflicts.length) throw new Error(`Resolve source conflicts before generation:\n${conflicts.join('\n')}`);
for (const locale of Object.keys(manifest.locales).filter((value) => !['en', 'zh-Hans'].includes(value))) {
  await buildLocaleInput(locale, domains);
}
console.log(`AI translation inputs written to ${outputRoot}`);
