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

    expect(sections[0]?.title).toBe('Commands');
    expect(sections[0]?.items.map((item) => item.id)).toEqual([
      'workspace.openSettings',
      'navigation.goBack',
      'editor.toggleDisplayMode'
    ]);
  });

  it('filters sections by query', () => {
    const sections = buildCommandMenuSections(baseItems, [], 'preview');

    expect(sections).toHaveLength(1);
    expect(sections[0]?.title).toBe('Commands');
    expect(sections[0]?.items[0]?.id).toBe('editor.toggleDisplayMode');
  });

  it('uses one flat section and sorts matching commands alphabetically', () => {
    const sections = buildCommandMenuSections(
      [
        { id: 'workspace.z', title: 'Z Workspace', section: 'Workspace', enabled: true },
        { id: 'import.b', title: 'B Import', section: 'Import', enabled: true },
        { id: 'workspace.a', title: 'A Workspace', section: 'Workspace', enabled: true },
        { id: 'navigation.a', title: 'A Navigation', section: 'Navigation', enabled: true }
      ],
      []
    );

    expect(sections).toHaveLength(1);
    expect(sections[0]?.title).toBe('Commands');
    expect(sections[0]?.items.map((item) => item.id)).toEqual([
      'navigation.a',
      'workspace.a',
      'import.b',
      'workspace.z'
    ]);
  });
});
