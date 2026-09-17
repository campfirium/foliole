import { stringify } from 'yaml';

import type { ReaderDocumentContract } from './readwiseApiContract.js';

export function formatReadwiseApiDocumentContent(
  document: ReaderDocumentContract,
  title: string,
  body: string
) {
  const frontmatter = stringify(compactMetadata({
    author: document.author,
    category: document.category,
    created_at: document.createdAt,
    full_title: title,
    id: document.id,
    image_url: document.imageUrl,
    notes: document.notes,
    parent_id: document.parentId,
    raw_source_url: document.rawSourceUrl,
    source_url: document.sourceUrl,
    summary: document.summary,
    tags: document.tags,
    updated_at: document.updatedAt,
    url: document.url
  }), { lineWidth: 0 }).trimEnd();
  const normalizedBody = demoteBodyTitleHeadings(body.trim());
  return [`---\n${frontmatter}\n---`, `# ${title}`, normalizedBody]
    .filter(Boolean)
    .join('\n\n');
}

function compactMetadata(metadata: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(metadata).filter(([, value]) => (
    value !== null && value !== undefined && value !== ''
  )));
}

function demoteBodyTitleHeadings(body: string) {
  let activeFence: '```' | '~~~' | null = null;
  return body.split('\n').map((line) => {
    const marker = line.match(/^\s{0,3}(```|~~~)/)?.[1] as '```' | '~~~' | undefined;
    if (marker) {
      activeFence = activeFence === marker ? null : marker;
      return line;
    }
    return !activeFence && /^\s{0,3}#\s+/.test(line) ? line.replace('#', '##') : line;
  }).join('\n');
}
