import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pdfKey = 'desktop.nodeList.readwiseResync.confirm.pdf';
const readKey = 'desktop.reviewActions.reading.read';
const en = {
  [pdfKey]: 'Get the PDF from Readwise and place Readwise highlights on it.',
  [readKey]: 'Read',
  'desktop.reviewComplete.read': 'Read',
  'settings.appearance.fontPreset.default': 'Default',
  'sample.structure': '<b>{count}</b> {shortcut} https://foliole.app'
};
const zh = {
  [pdfKey]: '从 Readwise 获取 PDF 并把 Readwise 高亮放回 PDF。',
  [readKey]: 'Read',
  'desktop.reviewComplete.read': '已阅读',
  'settings.appearance.fontPreset.default': '默认',
  'sample.structure': '<b>{count}</b> {shortcut} https://foliole.app'
};

async function prepareFixture(root) {
  const scriptRoot = path.join(root, 'scripts/localization');
  const localeRoot = path.join(root, 'src/shared/localization/locales');
  await fs.mkdir(scriptRoot, { recursive: true });
  await fs.mkdir(path.join(localeRoot, 'de'), { recursive: true });
  await fs.mkdir(path.join(root, 'lib/core/localization'), { recursive: true });
  await fs.symlink(path.join(repoRoot, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  for (const name of ['catalog-source.mjs', 'catalog-contract.mjs', 'check-locales.mjs',
    'build-ai-translation-input.mjs', 'protected-literals.json', 'semantic-conflicts.json']) {
    await fs.copyFile(path.join(repoRoot, 'scripts/localization', name), path.join(scriptRoot, name));
  }
  await fs.writeFile(path.join(root, 'lib/core/localization/appLocaleManifest.json'),
    JSON.stringify({ locales: { en: {}, 'zh-Hans': {}, de: {} } }));
  await writeSource(localeRoot, 'en.ts', en);
  await writeSource(localeRoot, 'zhHans.ts', zh);
  return localeRoot;
}

function writeSource(root, name, entries) {
  return fs.writeFile(path.join(root, name), `export default ${JSON.stringify(entries)};`);
}

function run(root, script) {
  try {
    return { status: 0, output: execFileSync('node', [path.join(root, 'scripts/localization', script)],
      { cwd: root, encoding: 'utf8', stdio: 'pipe' }) };
  } catch (error) {
    return { status: error.status, output: String(error.stderr) };
  }
}

it('uses the same scoped contract through AI generation and locale checking', async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(repoRoot, '.tmp/artifacts/localization-contract-')));
  try {
    const localeRoot = await prepareFixture(root);
    const target = path.join(localeRoot, 'de/core.json');
    await fs.writeFile(target, JSON.stringify(zh));
    expect(run(root, 'build-ai-translation-input.mjs').status).toBe(0);
    const input = await fs.readFile(path.join(root, '.tmp/artifacts/localization-ai-input/de/core.jsonl'), 'utf8');
    const records = Object.fromEntries(input.trim().split('\n').map((line) => {
      const record = JSON.parse(line);
      return [record.key, record];
    }));
    expect(records[readKey].protectedLiterals).toEqual(['Read']);
    expect(records['desktop.reviewComplete.read'].protectedLiterals).toEqual([]);
    expect(records['settings.appearance.fontPreset.default'].protectedLiterals).toEqual([]);
    expect(records[pdfKey].protectedLiterals).toEqual(['PDF', 'Readwise']);
    expect(run(root, 'check-locales.mjs').status).toBe(0);
    await assertTargetRejected(root, target, readKey, '阅读');
    await assertTargetRejected(root, target, pdfKey, zh[pdfKey].replaceAll('PDF', '文件'));
    await assertTargetRejected(root, target, 'sample.structure', '{count}');
    await writeSource(localeRoot, 'zhHans.ts', { ...zh, [readKey]: '阅读' });
    const rejectedSource = run(root, 'build-ai-translation-input.mjs');
    expect(rejectedSource.status).toBe(1);
    expect(rejectedSource.output).toContain(`${readKey}: protected literal changed`);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

async function assertTargetRejected(root, target, key, value) {
  await fs.writeFile(target, JSON.stringify({ ...zh, [key]: value }));
  const result = run(root, 'check-locales.mjs');
  expect(result.status).toBe(1);
  expect(result.output).toContain(`de/${key}:`);
}
