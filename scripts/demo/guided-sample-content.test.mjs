import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import { buildGuidedSampleContent } from './guided-sample-content.ts';

const GUIDED_OUTPUT = 'src/features/guidedSample/generated/guidedSamplePacks.ts';

it('keeps committed guided sample packs synchronized with the Guide sources', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'foliole-guided-sample-build-'));
  try {
    const outputPath = path.join(tempDir, 'generated', 'guidedSamplePacks.ts');
    const packs = await buildGuidedSampleContent({ contentRoot: 'docs/i18n/guides', outputPath });
    expect(Object.keys(packs)).toEqual(['en', 'de', 'es', 'fr', 'it', 'ja', 'ko', 'pl', 'pt-BR', 'ru', 'zh-Hans', 'zh-Hant']);
    await expect(readFile(outputPath, 'utf8')).resolves.toBe(await readFile(GUIDED_OUTPUT, 'utf8'));
    for (const fileName of ['en', 'de', 'es', 'fr', 'it', 'ja', 'ko', 'pl', 'pt_BR', 'ru', 'zh_Hans', 'zh_Hant']) {
      await expect(readFile(path.join(tempDir, 'generated', 'locales', `${fileName}.ts`), 'utf8')).resolves.toBe(
        await readFile(path.join(path.dirname(GUIDED_OUTPUT), 'locales', `${fileName}.ts`), 'utf8')
      );
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

it('rejects a registered locale directory gap before producing packs', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'foliole-guided-sample-gap-'));
  try {
    await mkdir(path.join(tempDir, 'en'), { recursive: true });
    await writeFile(path.join(tempDir, 'guide.yml'), [
      'welcome-to-foliole',
      '  one',
      '  two',
      '  three',
      '  four',
      '  five',
      '  six',
      '  seven'
    ].join('\n'), 'utf8');
    await writeFile(path.join(tempDir, 'assets.json'), '{}', 'utf8');
    await expect(buildGuidedSampleContent({
      contentRoot: tempDir,
      outputPath: path.join(tempDir, 'output.ts')
    })).rejects.toThrow('Registered app locale is missing Guide content: de -> de');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

it('rejects review items inside the Desktop welcome subtree', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'foliole-guided-sample-item-'));
  try {
    await mkdir(path.join(tempDir, 'en'), { recursive: true });
    await writeFile(path.join(tempDir, 'guide.yml'), 'welcome-to-foliole\n  recall, item\n', 'utf8');
    await writeFile(path.join(tempDir, 'assets.json'), '{}', 'utf8');
    await expect(buildGuidedSampleContent({
      contentRoot: tempDir,
      outputPath: path.join(tempDir, 'output.ts')
    })).rejects.toThrow('Desktop guided sample does not support Guide items');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

it('rejects nested topics inside the Desktop welcome subtree', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'foliole-guided-sample-nested-'));
  try {
    for (const locale of ['en', 'de', 'es', 'fr', 'it', 'ja', 'ko', 'pl', 'pt', 'ru', 'zh-hans', 'zh-hant']) {
      await mkdir(path.join(tempDir, locale), { recursive: true });
    }
    await writeFile(path.join(tempDir, 'guide.yml'), [
      'welcome-to-foliole',
      '  one',
      '    two',
      '  three',
      '  four',
      '  five',
      '  six',
      '  seven'
    ].join('\n'), 'utf8');
    await writeFile(path.join(tempDir, 'assets.json'), '{}', 'utf8');
    await expect(buildGuidedSampleContent({
      contentRoot: tempDir,
      outputPath: path.join(tempDir, 'output.ts')
    })).rejects.toThrow('Desktop guided sample topics must be direct root children');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
