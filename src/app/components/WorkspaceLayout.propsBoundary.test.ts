import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const groupedPropsSource = readFileSync(
  'src/app/components/workspaceLayoutGroupedProps.ts',
  'utf8'
);

function readWorkspaceLayoutPropsKeys() {
  const match = groupedPropsSource.match(/export interface WorkspaceLayoutProps \{([\s\S]*?)\n\}/);
  if (!match) {
    throw new Error('WorkspaceLayoutProps interface not found');
  }
  return Array.from((match[1] ?? '').matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9]*):/gm), ([, key]) => key);
}

describe('WorkspaceLayout props boundary', () => {
  it('keeps the workspace shell entry props grouped by surface', () => {
    expect(readWorkspaceLayoutPropsKeys()).toEqual([
      'navigation',
      'document',
      'editorCommands',
      'readingPosition',
      'review',
      'layoutChrome',
      'imports',
      'externalLibrary',
      'settings',
      'nodeList',
      'trash',
      'virtualView'
    ]);
  });

  it('keeps legacy flat fields out of WorkspaceLayoutProps', () => {
    expect(readWorkspaceLayoutPropsKeys()).not.toEqual(
      expect.arrayContaining(['activeNodeId', 'editorContent', 'onStartClipboardImport'])
    );
  });
});
