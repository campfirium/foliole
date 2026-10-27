import { promises as fs } from 'node:fs';
import path from 'node:path';

import { buildNodeBodyContentSql } from '../../lib/core/database/nodeBodySql.js';
import { loadDerivedNodeOrder } from '../../lib/core/database/parentChildOrder.js';
import { openDatabaseConnection } from '../database/connection.js';

export function parseAnchorLink(value: string) {
  return JSON.parse(value) as {
    id: string;
    kind: string;
    locator?: { from: number; originalText: string; to: number };
  };
}

export function mapChildRowsWithAnchorLink<T extends { anchor_link: string | null; content: string; title: string }>(childRows: T[]) {
  return childRows.map((child) => ({
    anchorLink: child.anchor_link ? parseAnchorLink(child.anchor_link) : null,
    content: child.content,
    title: child.title
  }));
}

export function createGenericKeepImportConfig(
  directoryPath: string,
  ruleId: string,
  highlightPolicy: 'adopt' | 'reference_only' = 'reference_only',
  highlightDirectoryPath?: string
) {
  return {
    directoryPath,
    ...(highlightDirectoryPath ? { highlightDirectoryPath, highlightMode: 'split' as const } : {}),
    highlightPolicy,
    ruleId
  } as const;
}

export async function seedGenericSplitSidecarFixture(tempRoot: string) {
  const sourceDir = path.join(tempRoot, 'split-source');
  const highlightDir = path.join(tempRoot, 'split-highlights');
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.mkdir(highlightDir, { recursive: true });
  await fs.writeFile(
    path.join(sourceDir, 'entry.md'),
    [
      '# Exported highlights',
      '',
      '## Metadata',
      '- Author: [[weibo.com]]',
      '- Full Title: Exported highlights',
      '- Category: #articles',
      '- URL: https://weibo.com/example',
      '',
      'Before matching highlight after.',
      '',
      'Other body.'
    ].join('\n'),
    'utf8'
  );
  await fs.writeFile(
    path.join(highlightDir, 'entry.md'),
    [
      '# Exported highlights',
      '',
      '## Metadata',
      '- Author: [[weibo.com]]',
      '- Full Title: Exported highlights',
      '- Category: #articles',
      '- URL: https://weibo.com/example',
      '',
      '## Saved passages',
      '- matching highlight ([View Highlight](https://read.readwise.io/read/01sample))',
      '',
      '- missing highlight'
    ].join('\n'),
    'utf8'
  );
  return { highlightDir, sourceDir };
}

export function readSplitChildren(parentId: string) {
  const { driver, sqlite } = openDatabaseConnection();
  const order = loadDerivedNodeOrder(driver);
  return (sqlite.prepare(`SELECT nodes.id, nodes.title, ${buildNodeBodyContentSql('nodes')} AS content, nodes.anchor_link
    FROM nodes LEFT JOIN content_blob_data cbd ON cbd.hash = nodes.body_blob_hash
    WHERE nodes.parent_id = ? AND nodes.deleted_at IS NULL`).all(parentId) as Array<{
      id: string; title: string; content: string; anchor_link: string | null;
    }>).sort((left, right) => order.indexOf(left.id) - order.indexOf(right.id));
}
