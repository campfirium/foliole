import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import appLocaleManifest from '../../lib/core/localization/appLocaleManifest.json' with { type: 'json' };
import type {
  GuidedSampleContentPack,
  GuidedSampleTopicTemplate
} from '../../src/features/guidedSample/model/guidedSamplePack.ts';

import {
  discoverLocales,
  flattenEntries,
  parseGuideOutline,
  readGuideMarkdown,
  topicId,
  writeIfChanged,
  type GuideEntry
} from './demo-guides-content.ts';

const GUIDED_SAMPLE_ROOT_ID = 'welcome-to-foliole';
type RegisteredAppLocale = keyof typeof appLocaleManifest.locales;
const APP_LOCALES = Object.keys(appLocaleManifest.locales) as RegisteredAppLocale[];

export interface BuildGuidedSampleContentArgs {
  contentRoot: string;
  outputPath: string;
}

type AssetsByTopicId = Record<string, string[]>;

export async function buildGuidedSampleContent(args: BuildGuidedSampleContentArgs) {
  const entries = parseGuideOutline(await readFile(path.join(args.contentRoot, 'guide.yml'), 'utf8'));
  const availableLocales = new Set(await discoverLocales(args.contentRoot));
  const assets = JSON.parse(await readFile(path.join(args.contentRoot, 'assets.json'), 'utf8')) as AssetsByTopicId;
  const guidedEntries = collectGuidedTopicEntries(entries);
  const sourceLocaleByAppLocale = Object.fromEntries(APP_LOCALES.map((locale) => [
    locale,
    locale === 'pt-BR' ? 'pt' : locale.toLowerCase()
  ])) as Record<RegisteredAppLocale, string>;
  for (const locale of APP_LOCALES) {
    const sourceLocale = sourceLocaleByAppLocale[locale];
    if (!availableLocales.has(sourceLocale)) {
      throw new Error(`Registered app locale is missing Guide content: ${locale} -> ${sourceLocale}`);
    }
  }
  const packs = {} as Record<RegisteredAppLocale, GuidedSampleContentPack>;
  for (const locale of APP_LOCALES) {
    const sourceLocale = sourceLocaleByAppLocale[locale];
    packs[locale] = await buildLocalePack(args.contentRoot, locale, sourceLocale, guidedEntries, assets);
  }
  await writeGeneratedPacks(args.outputPath, packs);
  return packs;
}

function collectGuidedTopicEntries(entries: GuideEntry[]) {
  const root = entries.find((entry) => entry.slug === GUIDED_SAMPLE_ROOT_ID && entry.parentId === null);
  if (!root) throw new Error(`Guide outline is missing ${GUIDED_SAMPLE_ROOT_ID}`);
  const subtree = flattenEntries([root]);
  const item = subtree.find((entry) => entry.type === 'item');
  if (item) throw new Error(`Desktop guided sample does not support Guide items: ${item.slug}`);
  if (subtree.length !== 8) throw new Error(`Desktop guided sample requires 8 topics, found ${subtree.length}`);
  const nestedChild = subtree.slice(1).find((entry) => entry.parentId !== topicId(root));
  if (nestedChild) {
    throw new Error(`Desktop guided sample topics must be direct root children: ${nestedChild.slug}`);
  }
  return subtree;
}

async function buildLocalePack(
  contentRoot: string,
  locale: RegisteredAppLocale,
  sourceLocale: string,
  entries: GuideEntry[],
  assets: AssetsByTopicId
): Promise<GuidedSampleContentPack> {
  const topics = await Promise.all(entries.map(async (entry) => {
    const id = topicId(entry);
    const markdown = await readGuideMarkdown(contentRoot, sourceLocale, id);
    const attachmentIds = assets[id] ?? [];
    return {
      attachmentIds,
      content: injectAssetMarkdown(markdown.source, attachmentIds),
      id,
      parentId: entry.parentId,
      title: markdown.title
    } satisfies GuidedSampleTopicTemplate;
  }));
  const root = topics[0];
  if (!root || root.id !== GUIDED_SAMPLE_ROOT_ID) throw new Error(`Invalid guided sample root for ${locale}`);
  return { locale, rootId: root.id, rootTitle: root.title, topics };
}

function injectAssetMarkdown(markdown: string, assetIds: readonly string[]) {
  if (!assetIds.length) return markdown;
  const lines = markdown.split(/\r?\n/);
  const title = lines.shift();
  if (!title?.startsWith('# ')) throw new Error('Guided sample topic is missing its leading H1');
  const images = assetIds.map((assetId) => `![image](asset://${assetId}.png)`).join('\n\n');
  return [title, images, lines.join('\n').trim()].filter(Boolean).join('\n\n');
}

async function writeGeneratedPacks(outputPath: string, packs: Record<RegisteredAppLocale, GuidedSampleContentPack>) {
  const resolved = path.resolve(outputPath);
  const localeDir = path.join(path.dirname(resolved), 'locales');
  await mkdir(localeDir, { recursive: true });
  const imports: string[] = [];
  const entries: string[] = [];
  for (const locale of APP_LOCALES) {
    const name = locale.replaceAll('-', '_').toUpperCase();
    const fileName = locale.replaceAll('-', '_');
    imports.push(`import { ${name}_GUIDED_SAMPLE_PACK } from './locales/${fileName}';`);
    entries.push(`  ${JSON.stringify(locale)}: ${name}_GUIDED_SAMPLE_PACK`);
    const localeSource = `import type { GuidedSampleContentPack } from '../../model/guidedSamplePack';\n\nexport const ${name}_GUIDED_SAMPLE_PACK: GuidedSampleContentPack = ${JSON.stringify(packs[locale], null, 2)};\n`;
    await writeIfChanged(path.join(localeDir, `${fileName}.ts`), localeSource);
  }
  const source = `import type { GuidedSampleContentPack } from '../model/guidedSamplePack';\n\n${imports.sort().join('\n')}\n\nexport const GENERATED_GUIDED_SAMPLE_PACKS: Record<string, GuidedSampleContentPack> = {\n${entries.join(',\n')}\n};\n`;
  await writeIfChanged(resolved, source);
}
