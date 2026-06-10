import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  DOCUMENT_KEYS,
  EDITOR_COMMAND_KEYS,
  EXTERNAL_LIBRARY_KEYS,
  IMPORT_KEYS,
  LAYOUT_CHROME_KEYS,
  NAVIGATION_KEYS,
  NODE_LIST_KEYS,
  READING_POSITION_KEYS,
  REVIEW_KEYS,
  SETTINGS_KEYS,
  TRASH_KEYS,
  VIRTUAL_VIEW_KEYS
} from './workspaceLayoutGroupedPropKeys';
import { groupWorkspaceLayoutProps } from './workspaceLayoutGroupedProps';
import type { WorkspaceLayoutFlatProps } from './workspaceLayoutPropGroups';

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

  it('keeps every runtime group limited to its declared keys', () => {
    const props = groupWorkspaceLayoutProps({
      editorContent: 'Document text',
      nodeViewById: { 'node-1': { scrollTop: 120 } },
      nodesById: {},
      nodeOrder: []
    } as unknown as WorkspaceLayoutFlatProps);

    expect(Object.keys(props.navigation)).toEqual([...NAVIGATION_KEYS]);
    expect(Object.keys(props.document)).toEqual([...DOCUMENT_KEYS]);
    expect(Object.keys(props.editorCommands)).toEqual([...EDITOR_COMMAND_KEYS]);
    expect(Object.keys(props.readingPosition)).toEqual([...READING_POSITION_KEYS]);
    expect(Object.keys(props.review)).toEqual([...REVIEW_KEYS]);
    expect(Object.keys(props.layoutChrome)).toEqual([...LAYOUT_CHROME_KEYS]);
    expect(Object.keys(props.imports)).toEqual([...IMPORT_KEYS]);
    expect(Object.keys(props.externalLibrary)).toEqual([...EXTERNAL_LIBRARY_KEYS]);
    expect(Object.keys(props.settings)).toEqual([...SETTINGS_KEYS]);
    expect(Object.keys(props.nodeList)).toEqual([...NODE_LIST_KEYS]);
    expect(Object.keys(props.trash)).toEqual([...TRASH_KEYS]);
    expect(Object.keys(props.virtualView)).toEqual([...VIRTUAL_VIEW_KEYS]);
    expect(props.document).toHaveProperty('editorContent');
    expect(props.document).toHaveProperty('nodeViewById');
    expect(props.nodeList).not.toHaveProperty('editorContent');
    expect(props.nodeList).not.toHaveProperty('nodeViewById');
    expect(props.review).not.toHaveProperty('editorContent');
    expect(props.review).not.toHaveProperty('nodeViewById');
  });
});
