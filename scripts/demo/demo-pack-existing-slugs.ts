import { readFile } from 'node:fs/promises';

import type { DemoPack } from '../../src/demo/demoPack.js';

export async function readExistingTopicSlugs(outputPath: string) {
  try {
    const source = await readFile(outputPath, 'utf8');
    const slugs = new Map<string, string>();
    const topicsSource = source.slice(Math.max(0, source.indexOf('topics')));
    const topicPattern = /(?:id|"id")\s*:\s*['"]([^'"]+)['"][\s\S]*?(?:slug|"slug")\s*:\s*['"]([^'"]+)['"]/gu;
    for (const match of topicsSource.matchAll(topicPattern)) {
      const [, id, slug] = match;
      if (id && slug) slugs.set(id, slug);
    }
    return slugs;
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return new Map<string, string>();
    throw error;
  }
}

export function assertUniqueSlugs(topics: DemoPack['topics']) {
  const seen = new Map<string, string>();
  topics.forEach((topic) => {
    const existingId = seen.get(topic.slug);
    if (existingId) throw new Error(`Duplicate Demo Pack topic slug: ${topic.slug} (${existingId}, ${topic.id})`);
    seen.set(topic.slug, topic.id);
  });
}

export function fallbackSlug(title: string, id: string, index: number) {
  const base = title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return base || `topic-${index + 1}-${id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}
