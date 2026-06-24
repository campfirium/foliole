import { describe, expect, it } from 'vitest';

import { buildCommandMenuSections } from './menuModel';
import type { CommandPaletteItem } from './types';

const baseItems: CommandPaletteItem[] = [
  { id: 'navigation.goBack', title: 'Go Back', section: 'Navigation', enabled: true },
  { id: 'workspace.openSettings', title: 'Open Settings', section: 'Workspace', enabled: true },
  { id: 'editor.toggleDisplayMode', title: 'Switch to Live Preview', section: 'Editor', enabled: true }
];

describe('buildCommandMenuSections', () => {
  it('keeps the last used command first and sorts the rest by title', () => {
    const sections = buildCommandMenuSections(baseItems, ['workspace.openSettings']);

    expect(sections.map((section) => section.title)).toEqual(['Recent', 'Navigation', 'Editor']);
    expect(sections[0]?.items.map((item) => item.id)).toEqual(['workspace.openSettings']);
  });

  it('uses the caller recent title and keeps localized sections in product order', () => {
    const sections = buildCommandMenuSections(
      [
        { id: 'workspace.z', title: 'Z', section: '工作区', sectionId: 'Workspace', enabled: true },
        { id: 'editor.a', title: 'A', section: '编辑器', sectionId: 'Editor', enabled: true },
        { id: 'navigation.a', title: 'A', section: '导航', sectionId: 'Navigation', enabled: true }
      ],
      ['workspace.z'],
      '',
      { recentTitle: '最近' }
    );

    expect(sections.map((section) => section.title)).toEqual(['最近', '导航', '编辑器']);
  });

  it('filters sections by query', () => {
    const sections = buildCommandMenuSections(baseItems, [], 'preview');

    expect(sections).toHaveLength(1);
    expect(sections[0]?.title).toBe('Editor');
    expect(sections[0]?.items[0]?.id).toBe('editor.toggleDisplayMode');
  });

  it('groups commands by product section order and sorts items alphabetically inside each section', () => {
    const sections = buildCommandMenuSections(
      [
        { id: 'workspace.z', title: 'Z Workspace', section: 'Workspace', enabled: true },
        { id: 'import.b', title: 'B Import', section: 'Import', enabled: true },
        { id: 'workspace.a', title: 'A Workspace', section: 'Workspace', enabled: true },
        { id: 'navigation.a', title: 'A Navigation', section: 'Navigation', enabled: true }
      ],
      []
    );

    expect(sections.map((section) => section.title)).toEqual(['Navigation', 'Workspace', 'Import']);
    expect(sections[1]?.items.map((item) => item.id)).toEqual(['workspace.a', 'workspace.z']);
  });

  it('sorts unknown sections after known command sections', () => {
    const sections = buildCommandMenuSections(
      [
        { id: 'unknown.a', title: 'A Unknown', section: 'Z Custom', enabled: true },
        { id: 'settings.a', title: 'A Settings', section: 'Settings', enabled: true }
      ],
      []
    );

    expect(sections.map((section) => section.title)).toEqual(['Settings', 'Z Custom']);
  });
});
