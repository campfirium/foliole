import fs from 'node:fs/promises';

import {
  extractReadwiseFullDocumentFrontmatter,
  extractReadwiseFullDocumentSummary
} from '../../lib/core/import/readwiseFullDocumentParsing.js';

export interface ReadwiseBookFullDocumentMetadata {
  downloadUrl: string | null;
  metadataFrontmatter: string;
  summary: string | null;
}

export function extractReadwiseDownloadUrl(markdown: string) {
  const directDownloadMatch = /\[Download original file[^\]]*]\((https?:\/\/[^)\s]+)\)/i.exec(markdown);
  if (directDownloadMatch?.[1]) {
    return directDownloadMatch[1];
  }
  const documentRawContentMatch = /(https?:\/\/\S*\/document_raw_content\/\d+\S*)/i.exec(markdown);
  if (documentRawContentMatch?.[1]) {
    return documentRawContentMatch[1];
  }
  const metadataDownloadMatch =
    /(?:^|\n)-?\s*(?:epub_download_url|download_url|epub_url|book_download_url|download url)\s*:\s*(https?:\/\/\S+)/i.exec(
      markdown
    );
  return metadataDownloadMatch?.[1] ?? null;
}

export async function resolveReadwiseBookFullDocumentMetadata(
  fullDocumentMarkdownPath: string | null
): Promise<ReadwiseBookFullDocumentMetadata> {
  if (!fullDocumentMarkdownPath) {
    return { downloadUrl: null, metadataFrontmatter: '', summary: null };
  }
  try {
    const markdown = await fs.readFile(fullDocumentMarkdownPath, 'utf8');
    return {
      downloadUrl: extractReadwiseDownloadUrl(markdown),
      metadataFrontmatter: extractReadwiseFullDocumentFrontmatter(markdown, { excludeKeys: ['summary'] }),
      summary: extractReadwiseFullDocumentSummary(markdown)
    };
  } catch {
    return { downloadUrl: null, metadataFrontmatter: '', summary: null };
  }
}
