import fs from 'node:fs/promises';
import path from 'node:path';

import ts from 'typescript';

const ENGLISH_FILE_PATTERN = /^en(?:[A-Z].*)?\.ts$/u;

async function readObjectEntries(filePath) {
  const sourceText = await fs.readFile(filePath, 'utf8');
  const source = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const entries = {};
  function visit(node) {
    if (ts.isPropertyAssignment(node)) {
      const key = readPropertyName(node.name);
      const value = readStringValue(node.initializer, filePath, key);
      if (key) entries[key] = value;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return entries;
}

function readPropertyName(name) {
  if (ts.isStringLiteral(name) || ts.isIdentifier(name)) return name.text;
  return null;
}

function readStringValue(initializer, filePath, key) {
  if (ts.isStringLiteral(initializer) || ts.isNoSubstitutionTemplateLiteral(initializer)) {
    return initializer.text;
  }
  throw new Error(`${filePath}: ${key ?? 'unknown key'} must be a static string.`);
}

export async function loadSourceDomains(repoRoot) {
  const localeRoot = path.join(repoRoot, 'src/shared/localization/locales');
  const fileNames = (await fs.readdir(localeRoot)).filter((name) => ENGLISH_FILE_PATTERN.test(name)).sort();
  const domains = [];
  for (const enFile of fileNames) {
    const suffix = enFile.slice(2, -3);
    const zhFile = `zhHans${suffix}.ts`;
    domains.push({
      domain: suffix ? `${suffix[0].toLowerCase()}${suffix.slice(1)}` : 'core',
      enFile,
      en: await readObjectEntries(path.join(localeRoot, enFile)),
      zh: await readObjectEntries(path.join(localeRoot, zhFile))
    });
  }
  return domains;
}

export function flattenDomains(domains, language) {
  return Object.assign({}, ...domains.map((domain) => domain[language]));
}
