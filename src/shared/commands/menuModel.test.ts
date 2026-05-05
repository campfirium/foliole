import { describe, expect, it } from 'vitest';

import { buildCommandMenuSections } from './menuModel';
import type { CommandPaletteItem } from './types';

const baseItems: CommandPaletteItem[] = [
  { id: 'navigation.goBack', title: 'Go Back', section: 'Navigation', enabled: true },
  { id: 'workspace.openSettings', title: 'Open Settings', section: 'Workspace', enabled: true },
  { id: 'editor.toggleDisplayMode', title: 'Switch to Live Preview', section: 'Editor', enabled: true }
];

describe('buildCommandMenuSections', () => {
  it('puts recent commands at top section in recency order', () => {
    const sections = buildCommandMenuSections(baseItems, ['workspace.openSettings', 'navigation.goBack']);

    expect(sections[0]?.title).toBe('Recent');
    expect(sections[0]?.items.map((item) => item.id)).toEqual(['workspace.openSettings', 'navigation.goBack']);
  });

  it('filters sections by query', () => {
    const sections = buildCommandMenuSections(baseItems, [], 'preview');

    expect(sections).toHaveLength(1);
    expect(sections[0]?.title).toBe('Editor');
    expect(sections[0]?.items[0]?.id).toBe('editor.toggleDisplayMode');
  });
});
